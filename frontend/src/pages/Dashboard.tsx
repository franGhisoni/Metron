import { useMemo } from "react";
import Decimal from "decimal.js";
import {
  useAccounts,
  useCashflowForecast,
  useCategories,
  useMonthlySeries,
  useMonthlySummary,
  useNetWorthHistory,
  useRates,
} from "../hooks/queries";
import { useCurrencyStore } from "../lib/currency";
import { fmtMoney, fmtPct } from "../lib/money";
import {
  formatShortDate,
  getCashflowTotals,
  getExpenseBreakdown,
  getMonthlySeriesChartData,
  getNetWorthChartData,
  getTransactionAmountForDisplay,
} from "../lib/reporting";
import {
  CategoryExpenseDonut,
  MonthlyIncomeExpenseChart,
  NetWorthHistoryChart,
  PanelCard,
} from "../components/reports/Charts";

export default function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { displayCurrency } = useCurrencyStore();

  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const summaryQ = useMonthlySummary(year, month);
  const seriesQ = useMonthlySeries(12);
  const historyQ = useNetWorthHistory(12);
  const cashflowQ = useCashflowForecast(30);
  const ratesQ = useRates();

  const accountNames = useMemo(
    () => new Map((accountsQ.data ?? []).map((account) => [account.id, account.name] as const)),
    [accountsQ.data]
  );
  const currentNetWorth = historyQ.data?.items[historyQ.data.items.length - 1]?.netWorth ?? null;
  const monthlyNet = summaryQ.data
    ? (displayCurrency === "ARS" ? summaryQ.data.net.ars : summaryQ.data.net.usd)
    : null;
  const mirrorCurrency = displayCurrency === "ARS" ? "USD" : "ARS";

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
  const cashflowTotals = useMemo(
    () => getCashflowTotals(cashflowQ.data?.items, displayCurrency),
    [cashflowQ.data?.items, displayCurrency]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Panel</h1>
          <p className="text-sm text-slate-400">
            Todos los montos principales siguen la moneda global elegida arriba.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
          Vista actual en <span className="font-medium text-slate-100">{displayCurrency}</span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title={`Patrimonio (${displayCurrency})`}
          value={
            currentNetWorth
              ? fmtMoney(
                  displayCurrency === "ARS" ? currentNetWorth.ars : currentNetWorth.usd,
                  displayCurrency
                )
              : "..."
          }
        />
        <Card
          title={`Ingresos ${month}/${year}`}
          value={
            summaryQ.data
              ? fmtMoney(
                  displayCurrency === "ARS" ? summaryQ.data.income.ars : summaryQ.data.income.usd,
                  displayCurrency
                )
              : "..."
          }
          tone="pos"
        />
        <Card
          title={`Gastos ${month}/${year}`}
          value={
            summaryQ.data
              ? fmtMoney(
                  displayCurrency === "ARS" ? summaryQ.data.expense.ars : summaryQ.data.expense.usd,
                  displayCurrency
                )
              : "..."
          }
          tone="neg"
        />
        <Card
          title={`Balance neto (${displayCurrency})`}
          value={monthlyNet ? fmtMoney(monthlyNet, displayCurrency) : "..."}
          tone={monthlyNet && new Decimal(monthlyNet).lt(0) ? "neg" : "pos"}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title={`Patrimonio (${mirrorCurrency})`}
          value={
            currentNetWorth
              ? fmtMoney(
                  mirrorCurrency === "ARS" ? currentNetWorth.ars : currentNetWorth.usd,
                  mirrorCurrency
                )
              : "..."
          }
        />
        <Card
          title="Tasa de ahorro"
          value={summaryQ.data ? fmtPct(summaryQ.data.savingsRate) : "..."}
        />
        <Card
          title="Dolar blue"
          value={ratesQ.data ? fmtMoney(ratesQ.data.rates.blue, "ARS") : "..."}
        />
        <Card
          title="Referencia"
          value={
            displayCurrency === "ARS"
              ? "Base en pesos"
              : ratesQ.data
                ? `1 USD = ${fmtMoney(ratesQ.data.rates.blue, "ARS")}`
                : "..."
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PanelCard
          title="Ingresos vs gastos"
          subtitle="Ultimos 12 meses en la moneda global activa."
        >
          <MonthlyIncomeExpenseChart data={monthlySeries} currency={displayCurrency} />
        </PanelCard>
        <PanelCard
          title="Patrimonio neto"
          subtitle="Serie mensual reconstruida desde balances actuales y movimientos historicos."
        >
          <NetWorthHistoryChart data={netWorthSeries} currency={displayCurrency} />
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <PanelCard
          title={`Gastos por categoria ${month}/${year}`}
          subtitle="Distribucion del mes actual segun los movimientos cargados."
        >
          <CategoryExpenseDonut items={categoryBreakdown} currency={displayCurrency} />
        </PanelCard>

        <PanelCard
          title="Cashflow proximo"
          subtitle="Pendientes y programados para los proximos 30 dias."
          className="h-full"
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <MiniStat
              label="Ingresos esperados"
              value={fmtMoney(cashflowTotals.income, displayCurrency)}
              tone="pos"
            />
            <MiniStat
              label="Compromisos"
              value={fmtMoney(cashflowTotals.commitments, displayCurrency)}
              tone="neg"
            />
          </div>

          <div className="space-y-2">
            {(cashflowQ.data?.items ?? []).slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-100">
                    {item.description || accountNames.get(item.accountId) || "Movimiento sin descripcion"}
                  </div>
                  <div className="text-xs text-slate-400">
                    {accountNames.get(item.accountId) || "Cuenta"} · {formatShortDate(item.dueDate ?? item.transactionDate)} · {item.status}
                  </div>
                </div>
                <div
                  className={
                    "text-sm font-semibold " +
                    (item.type === "income" ? "text-emerald-400" : "text-orange-300")
                  }
                >
                  {fmtMoney(getTransactionAmountForDisplay(item, displayCurrency), displayCurrency)}
                </div>
              </div>
            ))}

            {!cashflowQ.data?.items?.length ? (
              <div className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
                No hay movimientos pendientes o programados en esta ventana.
              </div>
            ) : null}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

const Card = ({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone?: "pos" | "neg";
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
    <div
      className={
        "mt-1 text-xl font-semibold " +
        (tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-white")
      }
    >
      {value}
    </div>
  </div>
);

const MiniStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    <div
      className={
        "mt-1 text-sm font-semibold " +
        (tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-orange-300" : "text-slate-100")
      }
    >
      {value}
    </div>
  </div>
);
