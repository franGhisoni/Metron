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

    // Credit-card txs are always recorded as "paid" — the purchase has happened
    // and becomes part of the statement. Whether the statement itself is paid
    // is tracked separately via payment transfers, not this field.
    const effectiveStatus = account.type === "credit_card" ? "paid" : body.status;

    const created = await app.prisma.transaction.create({
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

    // For paid, non-credit-card transactions, update the account balance.
    // Credit-card balances represent debt and are computed from statement logic,
    // so we don't mutate them here.
    if (effectiveStatus === "paid" && account.type !== "credit_card") {
      const delta =
        body.type === "income"
          ? toPrismaDecimal(body.currency === account.currency ? body.amount : amountArs)
          : body.type === "expense"
            ? toPrismaDecimal(
                "-" + (body.currency === account.currency ? body.amount : amountArs)
              )
            : null;
      if (delta !== null) {
        await app.prisma.account.update({
          where: { id: account.id },
          data: { balance: { increment: delta } },
        });
      }
    }

    return reply.code(201).send(serializeTransaction(created));
  });

  app.put("/:id", async (req, reply) => {
    const { id } = TxIdParam.parse(req.params);
    const body = UpdateTransactionBody.parse(req.body);

    const existing = await app.prisma.transaction.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    // Determine target account (account may be changing) and force CC txs to paid.
    const targetAccountId = body.accountId ?? existing.accountId;
    const targetAccount = await app.prisma.account.findFirst({
      where: { id: targetAccountId, userId: req.userId },
      select: { type: true },
    });
    const forcePaid = targetAccount?.type === "credit_card";
    const effectiveStatus = forcePaid ? "paid" : body.status;

    // Recompute dual amounts if amount/currency/rate changed.
    // Also: when a recurring child transitions scheduled/pending → paid, snap the
    // exchange rate to TODAY so the historical record reflects the rate actually used.
    // TODO: Phase 2 — rebalance account balance on edits.
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

    const updated = await app.prisma.transaction.update({
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
    return reply.send(serializeTransaction(updated));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = TxIdParam.parse(req.params);
    const existing = await app.prisma.transaction.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    // TODO: Phase 2 — rebalance account balance on delete for paid non-cc tx.
    await app.prisma.transaction.delete({ where: { id } });
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

    for (const r of rows) {
      const ars = new Decimal(r.amountArs.toString());
      const usd = new Decimal(r.amountUsd.toString());
      if (r.type === "income") {
        incomeArs = incomeArs.plus(ars);
        incomeUsd = incomeUsd.plus(usd);
      } else if (r.type === "expense") {
        expenseArs = expenseArs.plus(ars);
        expenseUsd = expenseUsd.plus(usd);
        const key = r.categoryId ?? "__uncategorized__";
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
      byCategory: Object.entries(byCategory).map(([categoryId, v]) => ({
        categoryId: categoryId === "__uncategorized__" ? null : categoryId,
        ars: v.ars.toString(),
        usd: v.usd.toString(),
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

    // TODO: Phase 2 — expand recurring transactions into forecast window.
    return {
      from: now.toISOString(),
      to: end.toISOString(),
      items: upcoming.map(serializeTransaction),
    };
  });
};

export default transactionRoutes;
