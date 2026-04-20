import { z } from "zod";

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

const CreateAccountBase = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES),
  balance: DecimalString.default("0"),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDaysAfterClosing: z.number().int().min(0).max(60).optional(),
  creditLimit: DecimalString.optional(),
});

export const CreateAccountBody = CreateAccountBase.superRefine((data, ctx) => {
  if (data.type === "credit_card") {
    if (data.closingDay === undefined)
      ctx.addIssue({ code: "custom", path: ["closingDay"], message: "required_for_credit_card" });
    if (data.dueDaysAfterClosing === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["dueDaysAfterClosing"],
        message: "required_for_credit_card",
      });
    if (data.creditLimit === undefined)
      ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "required_for_credit_card" });
  }
});
export type CreateAccountBody = z.infer<typeof CreateAccountBody>;

export const UpdateAccountBody = CreateAccountBase.partial();
export type UpdateAccountBody = z.infer<typeof UpdateAccountBody>;

export const AccountIdParam = z.object({ id: z.string().min(1) });
