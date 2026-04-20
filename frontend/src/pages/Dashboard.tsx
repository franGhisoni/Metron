import { useMemo } from "react";
import { useAccounts, useMonthlySummary, useRates } from "../hooks/queries";
import { fmtMoney, fmtPct } from "../lib/money";
import Decimal from "decimal.js";

export default function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const accountsQ = useAccounts();
  const summaryQ = useMonthlySummary(year, month);
  const ratesQ = useRates();

  const netWorth = useMemo(() => {
    if (!accountsQ.data || !ratesQ.data) return null;
    const blue = new Decimal(ratesQ.data.rates.blue);
    let ars = new Decimal(0);
    let usd = new Decimal(0);
    for (const a of accountsQ.data) {
      if (a.type === "credit_card") continue; // debt is tracked via statements
      const bal = new Decimal(a.balance);
      if (a.currency === "ARS") {
        ars = ars.plus(bal);
        usd = usd.plus(bal.div(blue));
      } else {
        usd = usd.plus(bal);
        ars = ars.plus(bal.mul(blue));
      }
    }
    return { ars: ars.toString(), usd: usd.toString() };
  }, [accountsQ.data, ratesQ.data]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Panel</h1>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Patrimonio (ARS)" value={netWorth ? fmtMoney(netWorth.ars, "ARS") : "…"} />
        <Card title="Patrimonio (USD)" value={netWorth ? fmtMoney(netWorth.usd, "USD") : "…"} />
        <Card
          title={`Ingresos ${month}/${year}`}
          value={summaryQ.data ? fmtMoney(summaryQ.data.income.ars, "ARS") : "…"}
          tone="pos"
        />
        <Card
          title={`Gastos ${month}/${year}`}
          value={summaryQ.data ? fmtMoney(summaryQ.data.expense.ars, "ARS") : "…"}
          tone="neg"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Balance neto del mes (ARS)"
          value={summaryQ.data ? fmtMoney(summaryQ.data.net.ars, "ARS") : "…"}
        />
        <Card
          title="Balance neto del mes (USD)"
          value={summaryQ.data ? fmtMoney(summaryQ.data.net.usd, "USD") : "…"}
        />
        <Card
          title="Tasa de ahorro"
          value={summaryQ.data ? fmtPct(summaryQ.data.savingsRate) : "…"}
        />
        <Card
          title="Dólar blue (referencia)"
          value={ratesQ.data ? fmtMoney(ratesQ.data.rates.blue, "ARS") : "…"}
        />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm uppercase tracking-wide text-slate-400">
          Próximamente
        </h2>
        <p className="text-sm text-slate-400">
          Gráficos de ingresos vs gastos, donut de categorías, forecast de cashflow a 30 días,
          alerta de liquidez. (Fase 2)
        </p>
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
