import Decimal from "decimal.js";
import { getPreferredAmountFromDual } from "./currency";
import type {
  Category,
  Currency,
  DualAmount,
  MonthlySeriesPoint,
  MonthlySummary,
  NetWorthHistoryPoint,
  Transaction,
} from "./types";

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export const buildMonthValue = (year: number, month: number) =>
  `${year}-${month.toString().padStart(2, "0")}`;

export const parseMonthValue = (value: string) => {
  const [rawYear, rawMonth] = value.split("-");
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const now = new Date();

  return {
    year: Number.isFinite(year) ? year : now.getFullYear(),
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
  };
};

export const getPreviousMonth = (year: number, month: number) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

export const formatMonthLabel = (year: number, month: number) =>
  monthFormatter.format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "");

export const formatShortDate = (iso: string) => shortDateFormatter.format(new Date(iso));

export const dualToNumber = (amounts: DualAmount, currency: Currency) =>
  new Decimal(getPreferredAmountFromDual(amounts, currency)).toNumber();

export const dualToString = (amounts: DualAmount, currency: Currency) =>
  getPreferredAmountFromDual(amounts, currency);

export const getMonthlySeriesChartData = (
  items: MonthlySeriesPoint[] | undefined,
  currency: Currency
) =>
  (items ?? []).map((item) => ({
    label: formatMonthLabel(item.year, item.month),
    income: dualToNumber(item.income, currency),
    expense: dualToNumber(item.expense, currency),
    net: dualToNumber(item.net, currency),
  }));

export const getNetWorthChartData = (
  items: NetWorthHistoryPoint[] | undefined,
  currency: Currency
) =>
  (items ?? []).map((item) => ({
    label: formatMonthLabel(item.year, item.month),
    value: dualToNumber(item.netWorth, currency),
  }));

export const getExpenseBreakdown = (
  summary: MonthlySummary | undefined,
  categories: Category[] | undefined,
  currency: Currency
) => {
  const categoriesById = new Map((categories ?? []).map((category) => [category.id, category] as const));

  return (summary?.byCategory ?? [])
    .map((item) => {
      const category = item.categoryId ? categoriesById.get(item.categoryId) : null;
      return {
        categoryId: item.categoryId,
        label: category?.name ?? "Sin categoria",
        icon: category?.icon ?? "•",
        color: category?.color ?? "#64748b",
        value: dualToNumber(item, currency),
      };
    })
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
};

export const getCashflowTotals = (items: Transaction[] | undefined, currency: Currency) => {
  let income = new Decimal(0);
  let commitments = new Decimal(0);

  for (const item of items ?? []) {
    const amount = new Decimal(currency === "ARS" ? item.amountArs : item.amountUsd);
    if (item.type === "income") {
      income = income.plus(amount);
    } else {
      commitments = commitments.plus(amount);
    }
  }

  return {
    income: income.toString(),
    commitments: commitments.toString(),
  };
};

export const getTransactionAmountForDisplay = (transaction: Transaction, currency: Currency) =>
  currency === "ARS" ? transaction.amountArs : transaction.amountUsd;

export const getComparisonDelta = (current: string, previous: string) => {
  const currentValue = new Decimal(current);
  const previousValue = new Decimal(previous);
  const absolute = currentValue.minus(previousValue);

  if (previousValue.eq(0)) {
    return {
      absolute: absolute.toString(),
      ratio: currentValue.eq(0) ? 0 : null,
    };
  }

  return {
    absolute: absolute.toString(),
    ratio: absolute.div(previousValue.abs()).toNumber(),
  };
};
