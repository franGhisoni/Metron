import { useMemo } from "react";
import Decimal from "decimal.js";
import {
  useAccounts,
  useCashflowForecast,
  useCategories,
  useCreditCardStatuses,
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
  getFiftyThirtyTwenty,
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
import { useAuth } from "../lib/auth";
import type { CreditCardStatus } from "../lib/types";

export default function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { displayCurrency } = useCurrencyStore();
  const { user } = useAuth();

  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const summaryQ = useMonthlySummary(year, month);
  const seriesQ = useMonthlySeries(12);
  const historyQ = useNetWorthHistory(12);
  const cashflowQ = useCashflowForecast(30);
  const ratesQ = useRates();
  const creditCardAccounts = useMemo(
    () => (accountsQ.data ?? []).filter((account) => account.type === "credit_card"),
    [accountsQ.data]
  );
  const creditCardStatusQs = useCreditCardStatuses(
    creditCardAccounts.map((account) => account.id)
  );

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
  const fiftyThirtyTwenty = useMemo(
    () => getFiftyThirtyTwenty(summaryQ.data, categoriesQ.data, displayCurrency),
    [summaryQ.data, categoriesQ.data, displayCurrency]
  );
  const creditCards = useMemo(() => {
    const byAccountId = new Map(
      creditCardStatusQs
        .map((query) => query.data)
        .filter((status): status is CreditCardStatus => !!status)
        .map((status) => [status.accountId, status] as const)
    );
    const totals = {
      currentArs: new Decimal(0),
      currentUsd: new Decimal(0),
      nextArs: new Decimal(0),
      nextUsd: new Decimal(0),
    };

    const cards = creditCardAccounts.map((account) => {
      const status = byAccountId.get(account.id) ?? null;
      if (status) {
        totals.currentArs = totals.currentArs.plus(status.currentStatement.ars);
        totals.currentUsd = totals.currentUsd.plus(status.currentStatement.usd);
        totals.nextArs = totals.nextArs.plus(status.nextStatement.ars);
        totals.nextUsd = totals.nextUsd.plus(status.nextStatement.usd);
      }
      return { account, status };
    });

    return {
      cards,
      totals: {
        currentStatement: {
          ars: totals.currentArs.toString(),
          usd: totals.currentUsd.toString(),
        },
        nextStatement: {
          ars: totals.nextArs.toString(),
          usd: totals.nextUsd.toString(),
        },
      },
      loading: creditCardStatusQs.some((query) => query.isLoading),
    };
  }, [creditCardAccounts, creditCardStatusQs]);
  const liquidityAlert = useMemo(() => {
    if (!user?.liquidityAlertThreshold || !accountsQ.data || !cashflowQ.data || !ratesQ.data) {
      return null;
    }

    const rate = new Decimal(ratesQ.data.rates.blue);
    const currentArs = accountsQ.data.reduce((total, account) => {
      if (account.type === "credit_card") return total;
      const balance = new Decimal(account.balance);
      return account.currency === "ARS" ? total.plus(balance) : total.plus(balance.mul(rate));
    }, new Decimal(0));
    const projectedArs = cashflowQ.data.items.reduce((total, item) => {
      const amount = new Decimal(item.amountArs);
      return item.type === "income" ? total.plus(amount) : total.minus(amount);
    }, currentArs);
    const threshold = new Decimal(user.liquidityAlertThreshold);

    return projectedArs.lt(threshold)
      ? {
          projectedArs: projectedArs.toString(),
          threshold: threshold.toString(),
        }
      : null;
  }, [accountsQ.data, cashflowQ.data, ratesQ.data, user?.liquidityAlertThreshold]);

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

      {liquidityAlert ? (
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
          <div className="font-semibold">Alerta de liquidez</div>
          <div className="mt-1 text-orange-100/80">
            El saldo proyectado a 30 dias queda en {fmtMoney(liquidityAlert.projectedArs, "ARS")},
            por debajo del umbral de {fmtMoney(liquidityAlert.threshold, "ARS")}.
          </div>
        </div>
      ) : null}

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

      {user?.fiftyThirtyTwenty ? (
        <PanelCard
          title="Tracker 50/30/20"
          subtitle="Necesidades, deseos y ahorro calculados contra los ingresos del mes."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            <BudgetRuleCard
              label="Necesidades"
              actual={fiftyThirtyTwenty.needs}
              target={fiftyThirtyTwenty.targets.needs}
              ratio={fiftyThirtyTwenty.ratios.needs}
              targetRatio={0.5}
              currency={displayCurrency}
            />
            <BudgetRuleCard
              label="Deseos"
              actual={fiftyThirtyTwenty.wants}
              target={fiftyThirtyTwenty.targets.wants}
              ratio={fiftyThirtyTwenty.ratios.wants}
              targetRatio={0.3}
              currency={displayCurrency}
            />
            <BudgetRuleCard
              label="Ahorro"
              actual={fiftyThirtyTwenty.savings}
              target={fiftyThirtyTwenty.targets.savings}
              ratio={fiftyThirtyTwenty.ratios.savings}
              targetRatio={0.2}
              currency={displayCurrency}
              higherIsBetter
            />
          </div>
        </PanelCard>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <PanelCard
          title={`Gastos por categoria ${month}/${year}`}
          subtitle="Distribucion del mes actual segun los movimientos cargados."
        >
          <CategoryExpenseDonut items={categoryBreakdown} currency={displayCurrency} />
        </PanelCard>

        <div className="space-y-4">
          <PanelCard
            title="Deuda de tarjetas"
            subtitle="Resumen actual y proximo, sin mezclar ARS y USD."
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <StatementStat
                label="Resumen actual"
                ars={creditCards.totals.currentStatement.ars}
                usd={creditCards.totals.currentStatement.usd}
              />
              <StatementStat
                label="Proximo resumen"
                ars={creditCards.totals.nextStatement.ars}
                usd={creditCards.totals.nextStatement.usd}
              />
            </div>

            <div className="space-y-2">
              {creditCards.cards.map(({ account, status }) => (
                <div
                  key={account.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-100">{account.name}</div>
                      <div className="text-xs text-slate-400">
                        {status
                          ? `Cierra ${formatShortDate(status.currentCloseDate)}`
                          : "Cargando estado"}
                      </div>
                    </div>
                    {status ? (
                      <StatementBreakdown
                        ars={status.currentStatement.ars}
                        usd={status.currentStatement.usd}
                      />
                    ) : null}
                  </div>
                </div>
              ))}

              {!creditCards.cards.length ? (
                <div className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
                  No hay tarjetas de credito cargadas.
                </div>
              ) : null}
              {creditCards.loading && creditCards.cards.length > 0 ? (
                <div className="text-xs text-slate-500">Actualizando deuda de tarjetas...</div>
              ) : null}
            </div>
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
        </div>
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

const BudgetRuleCard = ({
  label,
  actual,
  target,
  ratio,
  targetRatio,
  currency,
  higherIsBetter = false,
}: {
  label: string;
  actual: string;
  target: string;
  ratio: number | null;
  targetRatio: number;
  currency: "ARS" | "USD";
  higherIsBetter?: boolean;
}) => {
  const percent = ratio === null ? 0 : Math.max(0, Math.min(ratio, 1.25));
  const ok = ratio === null ? false : higherIsBetter ? ratio >= targetRatio : ratio <= targetRatio;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-100">{label}</div>
          <div className="mt-1 text-xs text-slate-500">
            Objetivo {(targetRatio * 100).toFixed(0)}% · {fmtMoney(target, currency)}
          </div>
        </div>
        <div className={ok ? "text-xs font-medium text-emerald-400" : "text-xs font-medium text-orange-300"}>
          {ratio === null ? "Sin ingresos" : `${(ratio * 100).toFixed(1)}%`}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={ok ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-orange-400"}
          style={{ width: `${percent * 80}%` }}
        />
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-100">{fmtMoney(actual, currency)}</div>
    </div>
  );
};

const StatementStat = ({ label, ars, usd }: { label: string; ars: string; usd: string }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-2">
      <StatementBreakdown ars={ars} usd={usd} align="start" />
    </div>
  </div>
);

const StatementBreakdown = ({
  ars,
  usd,
  align = "end",
}: {
  ars: string;
  usd: string;
  align?: "start" | "end";
}) => {
  const hasArs = !new Decimal(ars).eq(0);
  const hasUsd = !new Decimal(usd).eq(0);
  if (!hasArs && !hasUsd) {
    return (
      <div className={align === "end" ? "text-right" : ""}>
        <div className="text-sm font-semibold text-slate-100">{fmtMoney("0", "ARS")}</div>
      </div>
    );
  }

  return (
    <div className={align === "end" ? "shrink-0 text-right" : ""}>
      {hasArs ? (
        <div className="text-sm font-semibold text-slate-100">{fmtMoney(ars, "ARS")}</div>
      ) : null}
      {hasUsd ? (
        <div className="text-sm font-semibold text-sky-300">{fmtMoney(usd, "USD")}</div>
      ) : null}
    </div>
  );
};
