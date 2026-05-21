import { z } from "zod";

const splitQueryList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
};

const QueryStringList = z.preprocess(splitQueryList, z.array(z.string().min(1)).optional());

export const ReportsRangeQuery = z.object({
  months: z.coerce.number().int().positive().max(36).default(12),
  groupIds: QueryStringList,
});

export type ReportsRangeQuery = z.infer<typeof ReportsRangeQuery>;

export const CategoryProjectionQuery = z.object({
  months: z.coerce.number().int().min(2).max(12).default(3),
  groupIds: QueryStringList,
});

export type CategoryProjectionQuery = z.infer<typeof CategoryProjectionQuery>;
