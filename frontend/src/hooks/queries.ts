import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export const useRates = () =>
  useQuery({
    queryKey: ["rates", "current"],
    queryFn: async () =>
      (await api.get<{ rates: Rates; at: string }>("/api/rates/current")).data,
    staleTime: 60_000,
  });

export const useTransactions = (params: {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense" | "transfer";
  status?: "paid" | "pending" | "scheduled";
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}) =>
  useQuery({
    queryKey: ["transactions", params],
    queryFn: async () =>
      (
        await api.get<{ items: Transaction[]; nextCursor: string | null }>(
          "/api/transactions",
          { params }
        )
      ).data,
  });

export const useMonthlySummary = (year: number, month: number) =>
  useQuery({
    queryKey: ["summary", year, month],
    queryFn: async () =>
      (await api.get<MonthlySummary>("/api/transactions/summary", { params: { year, month } }))
        .data,
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
