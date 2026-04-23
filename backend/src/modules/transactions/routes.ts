import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import {
  CashflowForecastQuery,
  CreateTransactionBody,
  ListTransactionsQuery,
  SummaryQuery,
  TxIdParam,
  UpdateTransactionBody,
} from "./schemas.js";
import { computeDualAmounts, serializeTransaction } from "./service.js";
import { getCurrentRate } from "../rates/service.js";
import { assertAccountOwned } from "../accounts/service.js";
import { Decimal, toPrismaDecimal } from "../../lib/decimal.js";

type BalanceAwareTx = {
  type: "income" | "expense" | "transfer";
  status: "paid" | "pending" | "scheduled";
  amountArs: string;
  amountUsd: string;
};

type BalanceAwareAccount = {
  id: string;
  currency: "ARS" | "USD";
  type: string;
};

const getBalanceDelta = (
  tx: BalanceAwareTx,
  account: BalanceAwareAccount,
  linkedCounterpartAccountType: string | null = null
): Decimal | null => {
  if (account.type === "credit_card" || tx.status !== "paid") return null;

  const amount = new Decimal(account.currency === "ARS" ? tx.amountArs : tx.amountUsd);

  if (tx.type === "income") return amount;
  if (tx.type === "expense") return amount.negated();

  // Credit-card payments are represented as linked transfer pairs:
  // the non-card side reduces the source account balance.
  if (tx.type === "transfer" && linkedCounterpartAccountType === "credit_card") {
    return amount.negated();
  }

  return null;
};

const applyBalanceDelta = async (
  tx: Prisma.TransactionClient,
  accountId: string,
  delta: Decimal | null
) => {
  if (!delta || delta.isZero()) return;

  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: toPrismaDecimal(delta) } },
  });
};

const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    const q = ListTransactionsQuery.parse(req.query);

    const where: Prisma.TransactionWhereInput = {
      userId: req.userId,
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            transactionDate: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await app.prisma.transaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return {
      items: page.map(serializeTransaction),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  });

  app.post("/", async (req, reply) => {
    const body = CreateTransactionBody.parse(req.body);

    const account = await assertAccountOwned(app.prisma, body.accountId, req.userId);
    if (!account) return reply.code(404).send({ error: "account_not_found" });

    if (body.categoryId) {
      const cat = await app.prisma.category.findFirst({
        where: { id: body.categoryId, userId: req.userId },
      });
      if (!cat) return reply.code(404).send({ error: "category_not_found" });
    }

    const rate = body.exchangeRate ?? (await getCurrentRate(app.prisma, app.redis, "blue"));
    const { amountArs, amountUsd } = computeDualAmounts(body.amount, body.currency, rate);

    // Credit-card transactions are always paid: the purchase already happened.
    const effectiveStatus = account.type === "credit_card" ? "paid" : body.status;
    const balanceDelta = getBalanceDelta(
      {
        type: body.type,
        status: effectiveStatus,
        amountArs,
        amountUsd,
      },
      {
        id: account.id,
        currency: account.currency as "ARS" | "USD",
        type: account.type,
      }
    );

    const created = await app.prisma.$transaction(async (tx) => {
      const row = await tx.transaction.create({
        data: {
          userId: req.userId,
          accountId: body.accountId,
          categoryId: body.categoryId ?? null,
          type: body.type,
          amountArs: toPrismaDecimal(amountArs),
          amountUsd: toPrismaDecimal(amountUsd),
          exchangeRate: toPrismaDecimal(rate),
          currency: body.currency,
          description: body.description ?? null,
          paymentMethod: body.paymentMethod ?? null,
          transactionDate: new Date(body.transactionDate),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          status: effectiveStatus,
          isRecurring: body.isRecurring,
          recurringRule: body.recurringRule ?? null,
          installmentTotal: body.installmentTotal ?? null,
          installmentCurrent: body.installmentCurrent ?? null,
        },
      });

      await applyBalanceDelta(tx, account.id, balanceDelta);
      return row;
    });

    return reply.code(201).send(serializeTransaction(created));
  });

  app.put("/:id", async (req, reply) => {
    const { id } = TxIdParam.parse(req.params);
    const body = UpdateTransactionBody.parse(req.body);

    const existing = await app.prisma.transaction.findFirst({
      where: { id, userId: req.userId },
      include: {
        account: {
          select: { id: true, type: true, currency: true },
        },
      },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (body.categoryId) {
      const cat = await app.prisma.category.findFirst({
        where: { id: body.categoryId, userId: req.userId },
      });
      if (!cat) return reply.code(404).send({ error: "category_not_found" });
    }

    const targetAccount =
      body.accountId !== undefined
        ? await assertAccountOwned(app.prisma, body.accountId, req.userId)
        : existing.account;
    if (!targetAccount) return reply.code(404).send({ error: "account_not_found" });

    const forcePaid = targetAccount.type === "credit_card";
    const effectiveStatus = forcePaid ? "paid" : body.status;
    const nextStatus = effectiveStatus ?? existing.status;

    let linkedCounterpartAccountType: string | null = null;
    if (existing.linkedTransactionId) {
      const linked = await app.prisma.transaction.findUnique({
        where: { id: existing.linkedTransactionId },
        select: { account: { select: { type: true } } },
      });
      linkedCounterpartAccountType = linked?.account.type ?? null;
    }

    // Recompute dual amounts if amount/currency/rate changed.
    // When a recurring child transitions scheduled/pending to paid, snap the
    // exchange rate to today's rate so the record reflects what was actually used.
    let derived: { amountArs?: string; amountUsd?: string; exchangeRate?: string } = {};
    const transitionToPaid =
      body.status === "paid" &&
      existing.status !== "paid" &&
      existing.recurringParentId !== null;

    if (
      body.amount !== undefined ||
      body.currency !== undefined ||
      body.exchangeRate !== undefined ||
      transitionToPaid
    ) {
      const currency = (body.currency ?? existing.currency) as "ARS" | "USD";
      const rate =
        body.exchangeRate ??
        (transitionToPaid
          ? await getCurrentRate(app.prisma, app.redis, "blue")
          : existing.exchangeRate.toString());
      const amountInCurrency =
        body.amount ??
        (currency === "ARS" ? existing.amountArs.toString() : existing.amountUsd.toString());
      const dual = computeDualAmounts(amountInCurrency, currency, rate);
      derived = { amountArs: dual.amountArs, amountUsd: dual.amountUsd, exchangeRate: rate };
    }

    const previousDelta = getBalanceDelta(
      {
        type: existing.type,
        status: existing.status,
        amountArs: existing.amountArs.toString(),
        amountUsd: existing.amountUsd.toString(),
      },
      {
        id: existing.account.id,
        currency: existing.account.currency as "ARS" | "USD",
        type: existing.account.type,
      },
      linkedCounterpartAccountType
    );

    const nextDelta = getBalanceDelta(
      {
        type: body.type ?? existing.type,
        status: nextStatus,
        amountArs: derived.amountArs ?? existing.amountArs.toString(),
        amountUsd: derived.amountUsd ?? existing.amountUsd.toString(),
      },
      {
        id: targetAccount.id,
        currency: targetAccount.currency as "ARS" | "USD",
        type: targetAccount.type,
      },
      linkedCounterpartAccountType
    );

    const updated = await app.prisma.$transaction(async (tx) => {
      await applyBalanceDelta(tx, existing.account.id, previousDelta?.negated() ?? null);

      const row = await tx.transaction.update({
        where: { id },
        data: {
          ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
          ...(body.transactionDate !== undefined
            ? { transactionDate: new Date(body.transactionDate) }
            : {}),
          ...(body.dueDate !== undefined
            ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
            : {}),
          ...(effectiveStatus !== undefined ? { status: effectiveStatus } : {}),
          ...(body.isRecurring !== undefined ? { isRecurring: body.isRecurring } : {}),
          ...(body.recurringRule !== undefined ? { recurringRule: body.recurringRule } : {}),
          ...(body.installmentTotal !== undefined
            ? { installmentTotal: body.installmentTotal }
            : {}),
          ...(body.installmentCurrent !== undefined
            ? { installmentCurrent: body.installmentCurrent }
            : {}),
          ...(derived.amountArs ? { amountArs: toPrismaDecimal(derived.amountArs) } : {}),
          ...(derived.amountUsd ? { amountUsd: toPrismaDecimal(derived.amountUsd) } : {}),
          ...(derived.exchangeRate
            ? { exchangeRate: toPrismaDecimal(derived.exchangeRate) }
            : {}),
        },
      });

      await applyBalanceDelta(tx, targetAccount.id, nextDelta);
      return row;
    });

    return reply.send(serializeTransaction(updated));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = TxIdParam.parse(req.params);
    const existing = await app.prisma.transaction.findFirst({
      where: { id, userId: req.userId },
      include: {
        account: {
          select: { id: true, type: true, currency: true },
        },
      },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    let linkedCounterpartAccountType: string | null = null;
    if (existing.linkedTransactionId) {
      const linked = await app.prisma.transaction.findUnique({
        where: { id: existing.linkedTransactionId },
        select: { account: { select: { type: true } } },
      });
      linkedCounterpartAccountType = linked?.account.type ?? null;
    }

    const previousDelta = getBalanceDelta(
      {
        type: existing.type,
        status: existing.status,
        amountArs: existing.amountArs.toString(),
        amountUsd: existing.amountUsd.toString(),
      },
      {
        id: existing.account.id,
        currency: existing.account.currency as "ARS" | "USD",
        type: existing.account.type,
      },
      linkedCounterpartAccountType
    );

    await app.prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id } });
      await applyBalanceDelta(tx, existing.account.id, previousDelta?.negated() ?? null);
    });

    return reply.code(204).send();
  });

  // Monthly summary: totals by type in both currencies.
  app.get("/summary", async (req) => {
    const q = SummaryQuery.parse(req.query);
    const start = new Date(Date.UTC(q.year, q.month - 1, 1));
    const end = new Date(Date.UTC(q.year, q.month, 1));

    const rows = await app.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        transactionDate: { gte: start, lt: end },
      },
      select: {
        type: true,
        amountArs: true,
        amountUsd: true,
        categoryId: true,
      },
    });

    let incomeArs = new Decimal(0);
    let incomeUsd = new Decimal(0);
    let expenseArs = new Decimal(0);
    let expenseUsd = new Decimal(0);
    const byCategory: Record<string, { ars: Decimal; usd: Decimal }> = {};

    for (const row of rows) {
      const ars = new Decimal(row.amountArs.toString());
      const usd = new Decimal(row.amountUsd.toString());
      if (row.type === "income") {
        incomeArs = incomeArs.plus(ars);
        incomeUsd = incomeUsd.plus(usd);
      } else if (row.type === "expense") {
        expenseArs = expenseArs.plus(ars);
        expenseUsd = expenseUsd.plus(usd);
        const key = row.categoryId ?? "__uncategorized__";
        const bucket = byCategory[key] ?? { ars: new Decimal(0), usd: new Decimal(0) };
        bucket.ars = bucket.ars.plus(ars);
        bucket.usd = bucket.usd.plus(usd);
        byCategory[key] = bucket;
      }
    }

    const netArs = incomeArs.minus(expenseArs);
    const netUsd = incomeUsd.minus(expenseUsd);
    const savingsRate = incomeArs.gt(0) ? netArs.div(incomeArs).toNumber() : null;

    return {
      year: q.year,
      month: q.month,
      income: { ars: incomeArs.toString(), usd: incomeUsd.toString() },
      expense: { ars: expenseArs.toString(), usd: expenseUsd.toString() },
      net: { ars: netArs.toString(), usd: netUsd.toString() },
      savingsRate,
      byCategory: Object.entries(byCategory).map(([categoryId, value]) => ({
        categoryId: categoryId === "__uncategorized__" ? null : categoryId,
        ars: value.ars.toString(),
        usd: value.usd.toString(),
      })),
    };
  });

  app.get("/cashflow-forecast", async (req) => {
    const q = CashflowForecastQuery.parse(req.query);
    const now = new Date();
    const end = new Date(now.getTime() + q.days * 24 * 60 * 60 * 1000);

    const upcoming = await app.prisma.transaction.findMany({
      where: {
        userId: req.userId,
        status: { in: ["pending", "scheduled"] },
        OR: [
          { dueDate: { gte: now, lte: end } },
          { dueDate: null, transactionDate: { gte: now, lte: end } },
        ],
      },
      orderBy: [{ dueDate: "asc" }, { transactionDate: "asc" }],
    });

    // TODO: Phase 2 - expand recurring transactions into forecast window.
    return {
      from: now.toISOString(),
      to: end.toISOString(),
      items: upcoming.map(serializeTransaction),
    };
  });
};

export default transactionRoutes;
