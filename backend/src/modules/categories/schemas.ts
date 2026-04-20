import { z } from "zod";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const CreateCategoryBody = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(["income", "expense"]),
  color: z.string().regex(HEX, "invalid_hex_color"),
  icon: z.string().min(1).max(8),
  parentId: z.string().min(1).optional(),
});
export type CreateCategoryBody = z.infer<typeof CreateCategoryBody>;

export const UpdateCategoryBody = CreateCategoryBody.partial();
export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBody>;

export const CategoryIdParam = z.object({ id: z.string().min(1) });
