import { z } from "zod";

export const RegisterBody = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  phone: z.string().trim().min(5).max(32).optional(),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const UpdateMeBody = z.object({
  phone: z.string().trim().min(5).max(32).nullable().optional(),
  currencyPref: z.enum(["ARS", "USD"]).optional(),
  fiftyThirtyTwenty: z.boolean().optional(),
  liquidityAlertThreshold: z
    .union([
      z.string().trim().regex(/^\d+(\.\d{1,2})?$/),
      z.number().nonnegative(),
      z.null(),
    ])
    .optional(),
});
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;
