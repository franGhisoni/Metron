import type { Transaction } from "@prisma/client";
import { Decimal, serializeDecimal, toDecimal } from "../../lib/decimal.js";

export const serializeTransaction = (t: Transaction) => ({
  id: t.id,
  accountId: t.accountId,
  categoryId: t.categoryId,
  type: t.type,
  amountArs: serializeDecimal(t.amountArs) ?? "0",
  amountUsd: serializeDecimal(t.amountUsd) ?? "0",
  exchangeRate: serializeDecimal(t.exchangeRate) ?? "0",
  currency: t.currency,
  description: t.description,
  paymentMethod: t.paymentMethod,
  transactionDate: t.transactionDate.toISOString(),
  dueDate: t.dueDate?.toISOString() ?? null,
  status: t.status,
  isRecurring: t.isRecurring,
  recurringRule: t.recurringRule,
  installmentTotal: t.installmentTotal,
  installmentCurrent: t.installmentCurrent,
  createdAt: t.createdAt.toISOString(),
});

// Convert `amount` in `currency` into dual-currency storage using `rate`
// where `rate` is ARS per 1 USD.
export const computeDualAmounts = (
  amount: string,
  currency: "ARS" | "USD",
  rate: string
): { amountArs: string; amountUsd: string } => {
  const amt = toDecimal(amount);
  const r = toDecimal(rate);
  if (r.lte(0)) throw new Error("exchange_rate_must_be_positive");
  if (currency === "ARS") {
    return {
      amountArs: amt.toString(),
      amountUsd: amt.div(r).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString(),
    };
  }
  return {
    amountArs: amt.mul(r).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
    amountUsd: amt.toString(),
  };
};
