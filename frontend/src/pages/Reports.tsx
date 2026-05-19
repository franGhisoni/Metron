import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useCategories,
  useGroups,
  useMonthlySeries,
  useMonthlySummaries,
  useMonthlySummary,
  useNetWorthHistory,
} from "../hooks/queries";
import { useCurrencyStore } from "../lib/currency";
import { fmtMoney, fmtPct } from "../lib/money";
import {
  buildMonthValue,
  dualToString,
  formatMonthLabel,
  getCategoryTrends,
  getComparisonDelta,
  getExpenseBreakdown,
  getMonthlySeriesChartData,
  getNetWorthChartData,
  getPreviousMonth,
  getRecentMonths,
  parseMonthValue,
} from "../lib/reporting";
import {
  CategoryExpenseDonut,
  MonthlyIncomeExpenseChart,
  NetWorthHistoryChart,
  PanelCard,
} from "../components/reports/Charts";

export default function ReportsPage() {
  const { displayCurrency } = useCurrencyStore();
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const scopedParams = selectedGroupId ? { groupIds: [selectedGroupId] } : undefined;
  const seriesQ = useMonthlySeries(12, scopedParams);
  const historyQ = useNetWorthHistory(12, scopedParams);
  const categoriesQ = useCategories();
  const groupsQ = useGroups();
  const selectedGroup = (groupsQ.data ?? []).find((group) => group.id === selectedGroupId) ?? null;
  const isGroupScoped = !!selectedGroupId;
  const lastSeriesItem = seriesQ.data?.items[seriesQ.data.items.length - 1] ?? null;

  const defaultMonth = lastSeriesItem
    ? buildMonthValue(lastSeriesItem.year, lastSeriesItem.month)
    : buildMonthValue(new Date().getFullYear(), new Date().getMonth() + 1);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  useEffect(() => {
    if (!lastSeriesItem) return;
    setSelectedMonth((current) =>
      current || buildMonthValue(lastSeriesItem.year, lastSeriesItem.month)
    );
  }, [lastSeriesItem]);

  const selected = parseMonthValue(selectedMonth);
  const previous = getPreviousMonth(selected.year, selected.month);
  const trendMonths = useMemo(
    () => getRecentMonths(previous.year, previous.month, 3),
    [previous.year, previous.month]
  );
  const summaryQ = useMonthlySummary(selected.year, selected.month, scopedParams);
  const previousSummaryQ = useMonthlySummary(previous.year, previous.month, scopedParams);
  const trendSummaryQs = useMonthlySummaries(trendMonths, scopedParams);

  const monthOptions = useMemo(
    () =>
      (seriesQ.data?.items ?? []).map((item) => ({
        value: buildMonthValue(item.year, item.month),
        label: formatMonthLabel(item.year, item.month),
      })),
    [seriesQ.data?.items]
  );

  const monthlySeries = useMemo(
    () => getMonthlySeriesChartData(seriesQ.data?.items, displayCurrency),
    [seriesQ.data?.items, displayCurrency]
  );
  const netWorthSeries = useMemo(
    () => getNetWorthChartData(historyQ.data?.items, displayCurrency),
    [historyQ.data?.items, displayCurrency]
  );
  const categoryBreakdown = useMemo(
    () => getExpenseBreakdown(summaryQ.data, categoriesQ.data, displayCurrency).slice(0, 6),
    [summaryQ.data, categoriesQ.data, displayCurrency]
  );
  const categoryTrends = useMemo(
    () =>
      getCategoryTrends(
        summaryQ.data,
        trendSummaryQs.map((query) => query.data).filter((item): item is NonNullable<typeof item> => !!item),
        categoriesQ.data,
        displayCurrency
      ).slice(0, 8),
    [summaryQ.data, trendSummaryQs, categoriesQ.data, displayCurrency]
  );

  const selectedIncome = summaryQ.data ? dualToString(summaryQ.data.income, displayCurrency) : "0";
  const previousIncome = previousSummaryQ.data
    ? dualToString(previousSummaryQ.data.income, displayCurrency)
    : "0";
  const selectedExpense = summaryQ.data ? dualToString(summaryQ.data.expense, displayCurrency) : "0";
  const previousExpense = previousSummaryQ.data
    ? dualToString(previousSummaryQ.data.expense, displayCurrency)
    : "0";
  const selectedNet = summaryQ.data ? dualToString(summaryQ.data.net, displayCurrency) : "0";
  const previousNet = previousSummaryQ.data ? dualToString(previousSummaryQ.data.net, displayCurrency) : "0";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reportes</h1>
          <p className="text-sm text-slate-400">
            {isGroupScoped
              ? `Comparativa filtrada por ${selectedGroup?.name ?? "grupo"}.`
              : "Comparativa mensual y series historicas usando la moneda global seleccionada."}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-400">
            Grupo
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-brand-500"
            >
              <option value="">Todos</option>
              {(groupsQ.data ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-400">
            Mes analizado
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-brand-500"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonCard
          title="Ingresos"
          value={fmtMoney(selectedIncome, displayCurrency)}
          delta={getComparisonDelta(selectedIncome, previousIncome)}
          currency={displayCurrency}
        />
        <ComparisonCard
          title="Gastos"
          value={fmtMoney(selectedExpense, displayCurrency)}
          delta={getComparisonDelta(selectedExpense, previousExpense)}
          currency={displayCurrency}
          invertTone
        />
        <ComparisonCard
          title="Balance neto"
          value={fmtMoney(selectedNet, displayCurrency)}
          delta={getComparisonDelta(selectedNet, previousNet)}
          currency={displayCurrency}
        />
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Tasa de ahorro</div>
          <div className="mt-1 text-xl font-semibold text-slate-100">
            {summaryQ.data ? fmtPct(summaryQ.data.savingsRate) : "..."}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Mes anterior: {previousSummaryQ.data ? fmtPct(previousSummaryQ.data.savingsRate) : "..."}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PanelCard
          title="Ingresos vs gastos"
          subtitle="Serie de 12 meses para ver tendencia y estacionalidad."
        >
          <MonthlyIncomeExpenseChart data={monthlySeries} currency={displayCurrency} />
        </PanelCard>
        <PanelCard
          title={isGroupScoped ? "Resultado acumulado" : "Patrimonio neto"}
          subtitle={
            isGroupScoped
              ? "Acumulado mensual de ingresos menos gastos asociados al grupo."
              : "Cada punto usa el patrimonio reconstruido al cierre de mes."
          }
        >
          <NetWorthHistoryChart data={netWorthSeries} currency={displayCurrency} />
        </PanelCard>
      </section>

      <PanelCard
        title={`Gastos por categoria en ${formatMonthLabel(selected.year, selected.month)}`}
        subtitle="Las categorias principales del mes seleccionado."
      >
        <CategoryExpenseDonut items={categoryBreakdown} currency={displayCurrency} />
      </PanelCard>

      <PanelCard
        title="Variacion por categoria"
        subtitle="Mes seleccionado contra el promedio de los 3 meses anteriores."
      >
        <div className="overflow-hidden rounded-xl border border-slate-800">
          {categoryTrends.map((item) => (
            <div
              key={item.categoryId ?? "uncategorized"}
              className="grid gap-3 border-b border-slate-800 bg-slate-950/40 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_9rem_9rem_7rem]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="truncate text-sm font-medium text-slate-100">
                    {item.icon ? `${item.icon} ` : ""}
                    {item.label}
                  </div>
                </div>
              </div>
              <div className="text-sm text-slate-300 md:text-right">
                {fmtMoney(item.current, displayCurrency)}
              </div>
              <div className="text-sm text-slate-500 md:text-right">
                {fmtMoney(item.average, displayCurrency)}
              </div>
              <div className={clsx("text-sm font-medium md:text-right", trendTone(item.delta))}>
                {formatTrend(item.ratio, item.delta)}
              </div>
            </div>
          ))}

          {!categoryTrends.length ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Todavia no hay suficientes gastos para comparar categorias.
            </div>
          ) : null}
        </div>
      </PanelCard>
    </div>
  );
}

const trendTone = (delta: string) => {
  const value = Number(delta);
  if (value > 0) return "text-orange-300";
  if (value < 0) return "text-emerald-400";
  return "text-slate-500";
};

const formatTrend = (ratio: number | null, delta: string) => {
  if (ratio === null) return Number(delta) > 0 ? "Nuevo" : "Sin base";
  if (ratio === 0) return "0.0%";
  return `${ratio > 0 ? "+" : ""}${(ratio * 100).toFixed(1)}%`;
};

const ComparisonCard = ({
  title,
  value,
  delta,
  currency,
  invertTone = false,
}: {
  title: string;
  value: string;
  delta: { absolute: string; ratio: number | null };
  currency: "ARS" | "USD";
  invertTone?: boolean;
}) => {
  const isPositive = !delta.absolute.startsWith("-");
  const tone = invertTone ? !isPositive : isPositive;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
      <div className={clsx("mt-2 text-xs", tone ? "text-emerald-400" : "text-orange-300")}>
        {delta.absolute === "0"
          ? "Sin cambios vs mes anterior"
          : `${delta.absolute.startsWith("-") ? "" : "+"}${fmtMoney(delta.absolute, currency)} vs mes anterior`}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {delta.ratio === null
          ? "Sin base comparable"
          : `${delta.ratio >= 0 ? "+" : "-"}${Math.abs(delta.ratio * 100).toFixed(1)}%`}
      </div>
    </div>
  );
};
