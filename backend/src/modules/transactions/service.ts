import type { Transaction, TransactionGroupAssignment } from "@prisma/client";
import { ROUND_HALF_UP, serializeDecimal, toDecimal } from "../../lib/decimal.js";

type TransactionWithGroups = Transaction & {
  groupLinks?: Pick<TransactionGroupAssignment, "groupId">[];
};

export const serializeTransaction = (t: TransactionWithGroups) => ({
  id: t.id,
  accountId: t.accountId,
  categoryId: t.categoryId,
  groupIds: t.groupLinks?.map((link) => link.groupId) ?? [],
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
  recurringParentId: t.recurringParentId,
  linkedTransactionId: t.linkedTransactionId,
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
      amountUsd: amt.div(r).toDecimalPlaces(6, ROUND_HALF_UP).toString(),
    };
  }
  return {
    amountArs: amt.mul(r).toDecimalPlaces(2, ROUND_HALF_UP).toString(),
    amountUsd: amt.toString(),
  };
};
