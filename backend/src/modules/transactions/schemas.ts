import { z } from "zod";

const DecimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { message: "invalid_decimal" });

export const TX_TYPES = ["income", "expense", "transfer"] as const;
export const TX_STATUSES = ["paid", "pending", "scheduled"] as const;
export const CURRENCIES = ["ARS", "USD"] as const;
export const RECURRING_RULES = ["weekly", "biweekly", "monthly", "yearly"] as const;
const GroupIds = z.array(z.string().min(1)).max(25);

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
const QueryTxTypeList = z.preprocess(splitQueryList, z.array(z.enum(TX_TYPES)).optional());

export const CreateTransactionBody = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  groupIds: GroupIds.optional(),
  type: z.enum(TX_TYPES),
  amount: DecimalString,
  currency: z.enum(CURRENCIES),
  description: z.string().trim().max(500).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  transactionDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(TX_STATUSES),
  isRecurring: z.boolean().default(false),
  recurringRule: z.enum(RECURRING_RULES).optional(),
  installmentTotal: z.number().int().positive().max(120).optional(),
  installmentCurrent: z.number().int().positive().max(120).optional(),
  // Optional: caller can override the exchange rate (e.g. historical import).
  // Otherwise we fetch the latest "blue" rate at creation time.
  exchangeRate: DecimalString.optional(),
});
export type CreateTransactionBody = z.infer<typeof CreateTransactionBody>;

export const UpdateTransactionBody = z.object({
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  groupIds: GroupIds.optional(),
  type: z.enum(TX_TYPES).optional(),
  amount: DecimalString.optional(),
  currency: z.enum(CURRENCIES).optional(),
  description: z.string().trim().max(500).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  transactionDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(TX_STATUSES).optional(),
  isRecurring: z.boolean().optional(),
  recurringRule: z.enum(RECURRING_RULES).nullable().optional(),
  installmentTotal: z.number().int().positive().max(120).nullable().optional(),
  installmentCurrent: z.number().int().positive().max(120).nullable().optional(),
  exchangeRate: DecimalString.optional(),
});
export type UpdateTransactionBody = z.infer<typeof UpdateTransactionBody>;

export const TxIdParam = z.object({ id: z.string().min(1) });

export const ListTransactionsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  categoryIds: QueryStringList,
  groupIds: QueryStringList,
  type: z.enum(TX_TYPES).optional(),
  types: QueryTxTypeList,
  status: z.enum(TX_STATUSES).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(), // last tx id from previous page
});
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuery>;

export const SummaryQuery = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const CashflowForecastQuery = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});
