import { z } from "zod";

export const ReportsRangeQuery = z.object({
  months: z.coerce.number().int().positive().max(36).default(12),
});

export type ReportsRangeQuery = z.infer<typeof ReportsRangeQuery>;
