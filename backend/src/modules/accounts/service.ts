import type { Account, PrismaClient } from "@prisma/client";
import { serializeDecimal } from "../../lib/decimal.js";

export const serializeAccount = (a: Account) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  currency: a.currency,
  balance: serializeDecimal(a.balance) ?? "0",
  closingDay: a.closingDay,
  dueDaysAfterClosing: a.dueDaysAfterClosing,
  creditLimit: serializeDecimal(a.creditLimit),
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

export const assertAccountOwned = async (
  prisma: PrismaClient,
  accountId: string,
  userId: string
) => {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
  return acc ?? null;
};
