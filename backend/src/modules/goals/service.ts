import type { SavingsGoal } from "@prisma/client";
import { serializeDecimal } from "../../lib/decimal.js";

export const serializeGoal = (goal: SavingsGoal) => ({
  id: goal.id,
  name: goal.name,
  targetAmount: serializeDecimal(goal.targetAmount)!,
  currency: goal.currency,
  targetDate: goal.targetDate ? goal.targetDate.toISOString() : null,
  currentAmount: serializeDecimal(goal.currentAmount)!,
  status: goal.status,
  createdAt: goal.createdAt.toISOString(),
  updatedAt: goal.updatedAt.toISOString(),
});
