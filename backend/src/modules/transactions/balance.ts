import type { Prisma } from "@prisma/client";
import { Decimal, toPrismaDecimal } from "../../lib/decimal.js";

export type BalanceAwareTx = {
  type: "income" | "expense" | "transfer";
  status: "paid" | "pending" | "scheduled";
  amountArs: string;
  amountUsd: string;
};

export type BalanceAwareAccount = {
  id: string;
  currency: "ARS" | "USD";
  type: string;
};

export const getBalanceDelta = (
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

export const applyBalanceDelta = async (
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
