import type { FastifyPluginAsync } from "fastify";
import {
  AccountIdParam,
  CreateAccountBody,
  PayCreditCardBody,
  UpdateAccountBody,
} from "./schemas.js";
import { assertAccountOwned, serializeAccount } from "./service.js";
import { assignStatement, computeCreditCardStatus } from "./creditCard.js";
import { toPrismaDecimal, serializeDecimal, Decimal } from "../../lib/decimal.js";
import { getCurrentRate } from "../rates/service.js";
import { computeDualAmounts, serializeTransaction } from "../transactions/service.js";

const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    const rows = await app.prisma.account.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(serializeAccount);
  });

  app.post("/", async (req, reply) => {
    const body = CreateAccountBody.parse(req.body);
    const created = await app.prisma.account.create({
      data: {
        userId: req.userId,
        name: body.name,
        type: body.type,
        currency: body.currency,
        balance: toPrismaDecimal(body.balance),
        closingDay: body.closingDay ?? null,
        dueDaysAfterClosing: body.dueDaysAfterClosing ?? null,
        creditLimit: body.creditLimit ? toPrismaDecimal(body.creditLimit) : null,
      },
    });
    return reply.code(201).send(serializeAccount(created));
  });

  app.put("/:id", async (req, reply) => {
    const { id } = AccountIdParam.parse(req.params);
    const body = UpdateAccountBody.parse(req.body);

    const owned = await assertAccountOwned(app.prisma, id, req.userId);
    if (!owned) return reply.code(404).send({ error: "not_found" });

    const updated = await app.prisma.account.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.balance !== undefined ? { balance: toPrismaDecimal(body.balance) } : {}),
        ...(body.closingDay !== undefined ? { closingDay: body.closingDay } : {}),
        ...(body.dueDaysAfterClosing !== undefined
          ? { dueDaysAfterClosing: body.dueDaysAfterClosing }
          : {}),
        ...(body.creditLimit !== undefined
          ? { creditLimit: toPrismaDecimal(body.creditLimit) }
          : {}),
      },
    });
    return reply.send(serializeAccount(updated));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = AccountIdParam.parse(req.params);
    const owned = await assertAccountOwned(app.prisma, id, req.userId);
    if (!owned) return reply.code(404).send({ error: "not_found" });

    const txCount = await app.prisma.transaction.count({ where: { accountId: id } });
    if (txCount > 0) {
      return reply.code(409).send({
        error: "account_has_transactions",
        count: txCount,
      });
    }
    await app.prisma.account.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/:id/credit-card-status", async (req, reply) => {
    const { id } = AccountIdParam.parse(req.params);
    const acc = await assertAccountOwned(app.prisma, id, req.userId);
    if (!acc) return reply.code(404).send({ error: "not_found" });
    if (acc.type !== "credit_card" || acc.closingDay == null || acc.dueDaysAfterClosing == null) {
      return reply.code(400).send({ error: "not_a_credit_card" });
    }

    const today = new Date();
    const status = computeCreditCardStatus(acc.closingDay, acc.dueDaysAfterClosing, today);

    // Statement = charges (expenses) minus payments (incoming transfers).
    // Breakdown by ORIGINAL currency of each tx (not converted) — a card can carry
    // both ARS and USD charges side-by-side (e.g. local purchases + Netflix).
    const txs = await app.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        accountId: id,
        type: { in: ["expense", "transfer"] },
      },
      select: {
        type: true,
        currency: true,
        amountArs: true,
        amountUsd: true,
        transactionDate: true,
      },
    });

    let currentArs = new Decimal(0);
    let currentUsd = new Decimal(0);
    let nextArs = new Decimal(0);
    let nextUsd = new Decimal(0);
    // Parallel tally in CARD currency (using dual amounts) for utilization only.
    let currentInCardCurrency = new Decimal(0);

    for (const tx of txs) {
      const bucket = assignStatement(tx.transactionDate, today, acc.closingDay);
      const sign = tx.type === "expense" ? 1 : -1;
      const isArs = tx.currency === "ARS";
      const originalAmount = new Decimal((isArs ? tx.amountArs : tx.amountUsd).toString()).mul(sign);
      if (bucket === "current") {
        if (isArs) currentArs = currentArs.plus(originalAmount);
        else currentUsd = currentUsd.plus(originalAmount);
        const inCard =
          acc.currency === "ARS" ? tx.amountArs.toString() : tx.amountUsd.toString();
        currentInCardCurrency = currentInCardCurrency.plus(new Decimal(inCard).mul(sign));
      } else {
        if (isArs) nextArs = nextArs.plus(originalAmount);
        else nextUsd = nextUsd.plus(originalAmount);
      }
    }

    const creditLimit = serializeDecimal(acc.creditLimit);
    const utilization = creditLimit ? currentInCardCurrency.div(creditLimit).toNumber() : null;

    return reply.send({
      accountId: acc.id,
      currency: acc.currency,
      creditLimit,
      ...status,
      currentStatement: {
        ars: currentArs.toString(),
        usd: currentUsd.toString(),
      },
      nextStatement: {
        ars: nextArs.toString(),
        usd: nextUsd.toString(),
      },
      utilization,
    });
  });

  app.post("/:id/pay", async (req, reply) => {
    const { id } = AccountIdParam.parse(req.params);
    const body = PayCreditCardBody.parse(req.body);

    const cc = await assertAccountOwned(app.prisma, id, req.userId);
    if (!cc) return reply.code(404).send({ error: "not_found" });
    if (cc.type !== "credit_card") {
      return reply.code(400).send({ error: "not_a_credit_card" });
    }
    if (body.sourceAccountId === id) {
      return reply.code(400).send({ error: "source_equals_destination" });
    }

    const source = await assertAccountOwned(app.prisma, body.sourceAccountId, req.userId);
    if (!source) return reply.code(404).send({ error: "source_not_found" });
    if (source.type === "credit_card") {
      return reply.code(400).send({ error: "source_cannot_be_credit_card" });
    }

    const rate = await getCurrentRate(app.prisma, app.redis, "blue");
    const { amountArs, amountUsd } = computeDualAmounts(body.amount, body.currency, rate);
    const txDate = new Date(body.transactionDate);

    const sourceName = source.name;
    const ccName = cc.name;
    const sourceDescription = body.description ?? `Pago tarjeta ${ccName}`;
    const ccDescription = body.description ?? `Pago recibido desde ${sourceName}`;

    // Deduct from source account in its own currency (convert if mismatched).
    const sourceDelta =
      body.currency === source.currency
        ? body.amount
        : source.currency === "ARS"
          ? amountArs
          : amountUsd;

    const [sourceTx, ccTx] = await app.prisma.$transaction(async (tx) => {
      const created1 = await tx.transaction.create({
        data: {
          userId: req.userId,
          accountId: source.id,
          categoryId: null,
          type: "transfer",
          amountArs: toPrismaDecimal(amountArs),
          amountUsd: toPrismaDecimal(amountUsd),
          exchangeRate: toPrismaDecimal(rate),
          currency: body.currency,
          description: sourceDescription,
          paymentMethod: null,
          transactionDate: txDate,
          dueDate: null,
          status: "paid",
          isRecurring: false,
          recurringRule: null,
        },
      });
      const created2 = await tx.transaction.create({
        data: {
          userId: req.userId,
          accountId: cc.id,
          categoryId: null,
          type: "transfer",
          amountArs: toPrismaDecimal(amountArs),
          amountUsd: toPrismaDecimal(amountUsd),
          exchangeRate: toPrismaDecimal(rate),
          currency: body.currency,
          description: ccDescription,
          paymentMethod: null,
          transactionDate: txDate,
          dueDate: null,
          status: "paid",
          isRecurring: false,
          recurringRule: null,
          linkedTransactionId: created1.id,
        },
      });
      await tx.transaction.update({
        where: { id: created1.id },
        data: { linkedTransactionId: created2.id },
      });
      await tx.account.update({
        where: { id: source.id },
        data: { balance: { increment: toPrismaDecimal("-" + sourceDelta) } },
      });
      const refreshedSource = await tx.transaction.findUnique({ where: { id: created1.id } });
      return [refreshedSource!, created2] as const;
    });

    return reply.code(201).send({
      sourceTransaction: serializeTransaction(sourceTx),
      creditCardTransaction: serializeTransaction(ccTx),
    });
  });
};

export default accountRoutes;
