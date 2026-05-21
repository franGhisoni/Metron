import { z } from "zod";

export const ASSET_TYPES = [
  "crypto",
  "stock",
  "cedear",
  "bond",
  "plazo_fijo",
  "fci",
  "other",
] as const;

export const CURRENCIES = ["ARS", "USD"] as const;

const DecimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), { message: "invalid_decimal" });

export const CreateInvestmentBody = z.object({
  symbol: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  assetType: z.enum(ASSET_TYPES),
  quantity: DecimalString,
  purchasePrice: DecimalString,
  purchaseCurrency: z.enum(CURRENCIES),
  purchaseDate: z.string().datetime(),
  exchangeRateAtPurchase: DecimalString.optional(),
  currentPrice: DecimalString.optional(),
  currentPriceCurrency: z.enum(CURRENCIES).optional(),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.currentPrice && !data.currentPriceCurrency) {
    ctx.addIssue({
      code: "custom",
      path: ["currentPriceCurrency"],
      message: "required_with_current_price",
    });
  }
});
export type CreateInvestmentBody = z.infer<typeof CreateInvestmentBody>;

export const UpdateInvestmentBody = z.object({
  symbol: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  quantity: DecimalString.optional(),
  purchasePrice: DecimalString.optional(),
  purchaseCurrency: z.enum(CURRENCIES).optional(),
  purchaseDate: z.string().datetime().optional(),
  exchangeRateAtPurchase: DecimalString.optional(),
  currentPrice: DecimalString.nullable().optional(),
  currentPriceCurrency: z.enum(CURRENCIES).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.purchasePrice && !data.purchaseCurrency) {
    ctx.addIssue({
      code: "custom",
      path: ["purchaseCurrency"],
      message: "required_with_purchase_price",
    });
  }
  if (data.currentPrice && !data.currentPriceCurrency) {
    ctx.addIssue({
      code: "custom",
      path: ["currentPriceCurrency"],
      message: "required_with_current_price",
    });
  }
});
export type UpdateInvestmentBody = z.infer<typeof UpdateInvestmentBody>;

export const InvestmentIdParam = z.object({ id: z.string().min(1) });
