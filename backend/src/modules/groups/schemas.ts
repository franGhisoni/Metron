import { z } from "zod";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const CreateGroupBody = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(HEX, "invalid_hex_color"),
});
export type CreateGroupBody = z.infer<typeof CreateGroupBody>;

export const UpdateGroupBody = CreateGroupBody.partial();
export type UpdateGroupBody = z.infer<typeof UpdateGroupBody>;

export const GroupIdParam = z.object({ id: z.string().min(1) });
