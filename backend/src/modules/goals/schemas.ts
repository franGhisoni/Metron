import { z } from "zod";

export const CURRENCIES = ["ARS", "USD"] as const;
export const GOAL_STATUSES = ["wishlist", "active", "completed", "paused"] as const;

const DecimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), { message: "invalid_decimal" });

const NullableDateString = z
  .string()
  .datetime()
  .nullable()
  .optional();

export const CreateGoalBody = z.object({
  name: z.string().trim().min(1).max(100),
  targetAmount: DecimalString,
  currency: z.enum(CURRENCIES),
  targetDate: NullableDateString,
  currentAmount: DecimalString.default("0"),
  status: z.enum(GOAL_STATUSES).default("wishlist"),
});
export type CreateGoalBody = z.infer<typeof CreateGoalBody>;

export const UpdateGoalBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  targetAmount: DecimalString.optional(),
  currency: z.enum(CURRENCIES).optional(),
  targetDate: NullableDateString,
  currentAmount: DecimalString.optional(),
  status: z.enum(GOAL_STATUSES).optional(),
});
export type UpdateGoalBody = z.infer<typeof UpdateGoalBody>;

export const GoalIdParam = z.object({ id: z.string().min(1) });
