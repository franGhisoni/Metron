import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  useCategories,
  useMonthlySeries,
  useMonthlySummary,
  useNetWorthHistory,
} from "../hooks/queries";
import { useCurrencyStore } from "../lib/currency";
import { fmtMoney, fmtPct } from "../lib/money";
import {
  buildMonthValue,
  dualToString,
  formatMonthLabel,
  getComparisonDelta,
  getExpenseBreakdown,
  getMonthlySeriesChartData,
  getNetWorthChartData,
  getPreviousMonth,
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
  const seriesQ = useMonthlySeries(12);
  const historyQ = useNetWorthHistory(12);
  const categoriesQ = useCategories();
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
  const summaryQ = useMonthlySummary(selected.year, selected.month);
  const previousSummaryQ = useMonthlySummary(previous.year, previous.month);

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
            Comparativa mensual y series historicas usando la moneda global seleccionada.
          </p>
        </div>

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
          title="Patrimonio neto"
          subtitle="Cada punto usa el patrimonio reconstruido al cierre de mes."
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
    </div>
  );
}

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
