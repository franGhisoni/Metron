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

const monthNameFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "short",
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

export const getRecentMonths = (year: number, month: number, count: number) => {
  const months: Array<{ year: number; month: number }> = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    months.push({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
  }
  return months;
};

export const formatMonthLabel = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const monthName = monthNameFormatter.format(d).replace(".", "");
  const yearShort = String(year).slice(-2);
  return `${monthName} '${yearShort}`;
};

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

const NEED_KEYWORDS = [
  "alquiler",
  "educacion",
  "educación",
  "impuestos",
  "salud",
  "servicios",
  "supermercado",
  "transporte",
];

const classifyBudgetCategory = (label: string): "needs" | "wants" => {
  const normalized = label.trim().toLowerCase();
  return NEED_KEYWORDS.some((keyword) => normalized.includes(keyword)) ? "needs" : "wants";
};

export const getFiftyThirtyTwenty = (
  summary: MonthlySummary | undefined,
  categories: Category[] | undefined,
  currency: Currency
) => {
  const categoriesById = new Map((categories ?? []).map((category) => [category.id, category] as const));
  const income = new Decimal(summary ? dualToString(summary.income, currency) : "0");
  const net = new Decimal(summary ? dualToString(summary.net, currency) : "0");
  let needs = new Decimal(0);
  let wants = new Decimal(0);

  for (const item of summary?.byCategory ?? []) {
    const category = item.categoryId ? categoriesById.get(item.categoryId) : null;
    const amount = new Decimal(dualToString(item, currency));
    const bucket = classifyBudgetCategory(category?.name ?? "Otros");
    if (bucket === "needs") needs = needs.plus(amount);
    else wants = wants.plus(amount);
  }

  const savings = Decimal.max(net, 0);
  const ratio = (value: Decimal) => (income.gt(0) ? value.div(income).toNumber() : null);

  return {
    income: income.toString(),
    needs: needs.toString(),
    wants: wants.toString(),
    savings: savings.toString(),
    targets: {
      needs: income.mul(0.5).toString(),
      wants: income.mul(0.3).toString(),
      savings: income.mul(0.2).toString(),
    },
    ratios: {
      needs: ratio(needs),
      wants: ratio(wants),
      savings: ratio(savings),
    },
  };
};

export const getCategoryTrends = (
  currentSummary: MonthlySummary | undefined,
  previousSummaries: MonthlySummary[],
  categories: Category[] | undefined,
  currency: Currency
) => {
  const categoriesById = new Map((categories ?? []).map((category) => [category.id, category] as const));
  const currentByCategory = new Map(
    (currentSummary?.byCategory ?? []).map((item) => [item.categoryId ?? "__uncategorized__", item] as const)
  );
  const ids = new Set<string>(currentByCategory.keys());
  for (const summary of previousSummaries) {
    for (const item of summary.byCategory) ids.add(item.categoryId ?? "__uncategorized__");
  }

  return Array.from(ids)
    .map((id) => {
      const categoryId = id === "__uncategorized__" ? null : id;
      const category = categoryId ? categoriesById.get(categoryId) : null;
      const current = new Decimal(
        currentByCategory.has(id) ? dualToString(currentByCategory.get(id)!, currency) : "0"
      );
      const previousTotal = previousSummaries.reduce((total, summary) => {
        const item = summary.byCategory.find((entry) => (entry.categoryId ?? "__uncategorized__") === id);
        return total.plus(item ? dualToString(item, currency) : "0");
      }, new Decimal(0));
      const average = previousSummaries.length ? previousTotal.div(previousSummaries.length) : new Decimal(0);
      const delta = current.minus(average);
      const ratio = average.gt(0) ? delta.div(average).toNumber() : current.gt(0) ? null : 0;

      return {
        categoryId,
        label: category?.name ?? "Sin categoria",
        icon: category?.icon ?? "•",
        color: category?.color ?? "#64748b",
        current: current.toString(),
        average: average.toString(),
        delta: delta.toString(),
        ratio,
      };
    })
    .filter((item) => new Decimal(item.current).gt(0) || new Decimal(item.average).gt(0))
    .sort((left, right) => new Decimal(right.current).minus(left.current).toNumber());
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
