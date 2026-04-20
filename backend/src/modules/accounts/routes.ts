import type { FastifyPluginAsync } from "fastify";
import { AccountIdParam, CreateAccountBody, UpdateAccountBody } from "./schemas.js";
import { assertAccountOwned, serializeAccount } from "./service.js";
import { assignStatement, computeCreditCardStatus } from "./creditCard.js";
import { toPrismaDecimal, serializeDecimal, Decimal } from "../../lib/decimal.js";

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

    // Sum pending statement totals from transactions on this card.
    const txs = await app.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        accountId: id,
        type: "expense",
      },
      select: {
        amountArs: true,
        amountUsd: true,
        transactionDate: true,
      },
    });

    let currentArs = new Decimal(0);
    let currentUsd = new Decimal(0);
    let nextArs = new Decimal(0);
    let nextUsd = new Decimal(0);

    for (const tx of txs) {
      const bucket = assignStatement(tx.transactionDate, today, acc.closingDay);
      if (bucket === "current") {
        currentArs = currentArs.plus(tx.amountArs.toString());
        currentUsd = currentUsd.plus(tx.amountUsd.toString());
      } else {
        nextArs = nextArs.plus(tx.amountArs.toString());
        nextUsd = nextUsd.plus(tx.amountUsd.toString());
      }
    }

    const creditLimit = serializeDecimal(acc.creditLimit);
    const utilization =
      creditLimit && acc.currency === "ARS"
        ? currentArs.div(creditLimit).toNumber()
        : creditLimit && acc.currency === "USD"
          ? currentUsd.div(creditLimit).toNumber()
          : null;

    return reply.send({
      accountId: acc.id,
      currency: acc.currency,
      creditLimit,
      ...status,
      currentStatement: {
        totalArs: currentArs.toString(),
        totalUsd: currentUsd.toString(),
      },
      nextStatement: {
        totalArs: nextArs.toString(),
        totalUsd: nextUsd.toString(),
      },
      utilization,
    });
  });
};

export default accountRoutes;
