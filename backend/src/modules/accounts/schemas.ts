import { z } from "zod";
import Decimal from "decimal.js";

export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "investment",
  "crypto_wallet",
  "other",
] as const;

export const CURRENCIES = ["ARS", "USD"] as const;

const DecimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { message: "invalid_decimal" });
const PositiveDecimalString = DecimalString.refine((v) => /^\d+(\.\d+)?$/.test(v) && new Decimal(v).gt(0), {
  message: "amount_must_be_positive",
});

const CreateAccountBase = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES),
  balance: DecimalString.default("0"),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDaysAfterClosing: z.number().int().min(0).max(60).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  dueMonthOffset: z.number().int().min(0).max(1).optional(),
  creditLimit: DecimalString.optional(),
});

export const CreateAccountBody = CreateAccountBase.superRefine((data, ctx) => {
  if (data.type === "credit_card") {
    if (data.closingDay === undefined)
      ctx.addIssue({ code: "custom", path: ["closingDay"], message: "required_for_credit_card" });
    if (data.dueDay === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["dueDay"],
        message: "required_for_credit_card",
      });
    if (data.dueMonthOffset === undefined)
      ctx.addIssue({ code: "custom", path: ["dueMonthOffset"], message: "required_for_credit_card" });
    if (data.dueMonthOffset === 0 && data.dueDay !== undefined &&
        data.closingDay !== undefined && data.dueDay <= data.closingDay)
      ctx.addIssue({ code: "custom", path: ["dueDay"], message: "due_must_follow_close" });
    if (data.creditLimit === undefined)
      ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "required_for_credit_card" });
  }
});
export type CreateAccountBody = z.infer<typeof CreateAccountBody>;

export const UpdateAccountBody = CreateAccountBase.partial();
export type UpdateAccountBody = z.infer<typeof UpdateAccountBody>;

export const AccountIdParam = z.object({ id: z.string().min(1) });

export const PayCreditCardBody = z.object({
  sourceAccountId: z.string().min(1),
  amount: PositiveDecimalString,
  currency: z.enum(CURRENCIES),
  transactionDate: z.string().datetime(),
  description: z.string().trim().max(500).optional(),
});
export type PayCreditCardBody = z.infer<typeof PayCreditCardBody>;
