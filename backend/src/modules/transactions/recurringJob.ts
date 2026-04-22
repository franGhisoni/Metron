import type { FastifyInstance } from "fastify";
import { getCurrentRate } from "../rates/service.js";
import { computeDualAmounts } from "./service.js";
import { toPrismaDecimal } from "../../lib/decimal.js";

export const RECURRING_RULES = ["weekly", "biweekly", "monthly", "yearly"] as const;
export type RecurringRule = (typeof RECURRING_RULES)[number];

const advance = (d: Date, rule: string): Date => {
  const n = new Date(d);
  switch (rule) {
    case "weekly":
      n.setDate(n.getDate() + 7);
      return n;
    case "biweekly":
      n.setDate(n.getDate() + 14);
      return n;
    case "monthly":
      n.setMonth(n.getMonth() + 1);
      return n;
    case "yearly":
      n.setFullYear(n.getFullYear() + 1);
      return n;
    default:
      throw new Error(`unknown_recurring_rule:${rule}`);
  }
};

export const generateRecurringInstances = async (app: FastifyInstance) => {
  const templates = await app.prisma.transaction.findMany({
    where: { isRecurring: true, recurringRule: { not: null } },
    include: {
      recurringChildren: { orderBy: { transactionDate: "desc" }, take: 1 },
    },
  });

  const now = new Date();
  // Horizon: end of the NEXT calendar month. Enough buffer to surface upcoming payments.
  const horizon = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  let created = 0;
  for (const tpl of templates) {
    if (!tpl.recurringRule) continue;
    const last = tpl.recurringChildren[0];
    let cursor = last
      ? advance(last.transactionDate, tpl.recurringRule)
      : advance(tpl.transactionDate, tpl.recurringRule);

    while (cursor <= horizon) {
      const exists = await app.prisma.transaction.findFirst({
        where: { recurringParentId: tpl.id, transactionDate: cursor },
        select: { id: true },
      });
      if (!exists) {
        const rate = await getCurrentRate(app.prisma, app.redis, "blue");
        const currency = tpl.currency as "ARS" | "USD";
        const amountInCurrency =
          currency === "ARS" ? tpl.amountArs.toString() : tpl.amountUsd.toString();
        const { amountArs, amountUsd } = computeDualAmounts(
          amountInCurrency,
          currency,
          rate
        );
        await app.prisma.transaction.create({
          data: {
            userId: tpl.userId,
            accountId: tpl.accountId,
            categoryId: tpl.categoryId,
            type: tpl.type,
            amountArs: toPrismaDecimal(amountArs),
            amountUsd: toPrismaDecimal(amountUsd),
            exchangeRate: toPrismaDecimal(rate),
            currency: tpl.currency,
            description: tpl.description,
            paymentMethod: tpl.paymentMethod,
            transactionDate: cursor,
            dueDate: null,
            status: "scheduled",
            isRecurring: false,
            recurringParentId: tpl.id,
            recurringRule: null,
          },
        });
        created++;
      }
      cursor = advance(cursor, tpl.recurringRule);
    }
  }
  return { templates: templates.length, created };
};

export const startRecurringJob = (app: FastifyInstance) => {
  const run = async () => {
    try {
      const res = await generateRecurringInstances(app);
      app.log.info(res, "recurring instances generated");
    } catch (err) {
      app.log.error({ err }, "recurring job error");
    }
  };
  void run();
  const handle = setInterval(run, 24 * 60 * 60 * 1000);
  app.addHook("onClose", async () => {
    clearInterval(handle);
  });
};
