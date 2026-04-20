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
