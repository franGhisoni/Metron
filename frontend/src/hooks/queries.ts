import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  Account,
  CashflowForecast,
  Category,
  CreditCardStatus,
  MonthlySummary,
  MonthlySeriesPoint,
  NetWorthHistoryPoint,
  Rates,
  Transaction,
  TransactionGroup,
} from "../lib/types";

export const useAccounts = () =>
  useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await api.get<Account[]>("/api/accounts")).data,
  });

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/api/categories")).data,
  });

export const useGroups = () =>
  useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await api.get<TransactionGroup[]>("/api/groups")).data,
  });

export const useRates = () =>
  useQuery({
    queryKey: ["rates", "current"],
    queryFn: async () =>
      (await api.get<{ rates: Rates; at: string }>("/api/rates/current")).data,
    staleTime: 60_000,
  });

type TransactionParams = {
  accountId?: string;
  categoryId?: string;
  categoryIds?: string[];
  groupIds?: string[];
  type?: "income" | "expense" | "transfer";
  types?: Array<"income" | "expense" | "transfer">;
  status?: "paid" | "pending" | "scheduled";
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

// Build query string manually so arrays use repeated keys (types=a&types=b)
// instead of axios's default bracket notation (types[]=a) which Fastify ignores.
function buildTxQS(p: TransactionParams): string {
  const usp = new URLSearchParams();
  if (p.from) usp.set("from", p.from);
  if (p.to) usp.set("to", p.to);
  if (p.limit !== undefined) usp.set("limit", String(p.limit));
  if (p.accountId) usp.set("accountId", p.accountId);
  if (p.categoryId) usp.set("categoryId", p.categoryId);
  if (p.type) usp.set("type", p.type);
  if (p.status) usp.set("status", p.status);
  if (p.cursor) usp.set("cursor", p.cursor);
  p.types?.forEach((t) => usp.append("types", t));
  p.categoryIds?.forEach((c) => usp.append("categoryIds", c));
  p.groupIds?.forEach((g) => usp.append("groupIds", g));
  return usp.toString();
}

export const useTransactions = (params: TransactionParams) => {
  const qs = buildTxQS(params);
  return useQuery({
    queryKey: ["transactions", params],
    queryFn: async () =>
      (
        await api.get<{ items: Transaction[]; nextCursor: string | null }>(
          `/api/transactions${qs ? `?${qs}` : ""}`
        )
      ).data,
  });
};

export const useMonthlySummary = (year: number, month: number) =>
  useQuery({
    queryKey: ["summary", year, month],
    queryFn: async () =>
      (await api.get<MonthlySummary>("/api/transactions/summary", { params: { year, month } }))
        .data,
  });

export const useMonthlySummaries = (months: Array<{ year: number; month: number }>) =>
  useQueries({
    queries: months.map(({ year, month }) => ({
      queryKey: ["summary", year, month],
      queryFn: async () =>
        (await api.get<MonthlySummary>("/api/transactions/summary", { params: { year, month } }))
          .data,
    })),
  });

export const useMonthlySeries = (months = 12) =>
  useQuery({
    queryKey: ["reports", "monthly-series", months],
    queryFn: async () =>
      (
        await api.get<{ months: number; items: MonthlySeriesPoint[] }>(
          "/api/reports/monthly-series",
          { params: { months } }
        )
      ).data,
  });

export const useNetWorthHistory = (months = 12) =>
  useQuery({
    queryKey: ["reports", "net-worth-history", months],
    queryFn: async () =>
      (
        await api.get<{ months: number; items: NetWorthHistoryPoint[] }>(
          "/api/reports/net-worth-history",
          { params: { months } }
        )
      ).data,
  });

export const useCashflowForecast = (days = 30) =>
  useQuery({
    queryKey: ["reports", "cashflow-forecast", days],
    queryFn: async () =>
      (await api.get<CashflowForecast>("/api/transactions/cashflow-forecast", { params: { days } }))
        .data,
  });

export const useCreditCardStatus = (accountId: string | null | undefined) =>
  useQuery({
    enabled: !!accountId,
    queryKey: ["creditCardStatus", accountId],
    queryFn: async () =>
      (await api.get<CreditCardStatus>(`/api/accounts/${accountId}/credit-card-status`)).data,
  });

export const useCreditCardStatuses = (accountIds: string[]) =>
  useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: ["creditCardStatus", accountId],
      queryFn: async () =>
        (await api.get<CreditCardStatus>(`/api/accounts/${accountId}/credit-card-status`)).data,
      enabled: !!accountId,
    })),
  });

export const useCreateTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post<Transaction>("/api/transactions", body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["creditCardStatus"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const useDeleteTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/transactions/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["creditCardStatus"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const useUpdateTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      (await api.put<Transaction>(`/api/transactions/${id}`, body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["creditCardStatus"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post<Category>("/api/categories", body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      (await api.put<Category>(`/api/categories/${id}`, body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/categories/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["categories"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
};

export const useCreateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post<TransactionGroup>("/api/groups", body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
};

export const useUpdateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      (await api.put<TransactionGroup>(`/api/groups/${id}`, body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
};

export const useDeleteGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/groups/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["groups"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
};

export const useCreateAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post<Account>("/api/accounts", body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const usePayCreditCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ccAccountId,
      ...body
    }: {
      ccAccountId: string;
      sourceAccountId: string;
      amount: string;
      currency: "ARS" | "USD";
      transactionDate: string;
      description?: string;
    }) => (await api.post(`/api/accounts/${ccAccountId}/pay`, body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["creditCardStatus"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const useDeleteAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/accounts/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};
