import type { ReactNode } from "react";
import clsx from "clsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "../../lib/money";
import type { Currency } from "../../lib/types";

const compactFormatter = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const axisTick = (value: number) => compactFormatter.format(value);

export const PanelCard = ({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) => (
  <section className={clsx("rounded-xl border border-slate-800 bg-slate-900 p-4", className)}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
    </div>
    {children}
  </section>
);

export const EmptyChartState = ({ message }: { message: string }) => (
  <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
    {message}
  </div>
);

export const MonthlyIncomeExpenseChart = ({
  data,
  currency,
}: {
  data: Array<{ label: string; income: number; expense: number }>;
  currency: Currency;
}) => {
  if (!data.length) return <EmptyChartState message="Todavia no hay movimientos para graficar." />;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={8}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={axisTick}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value: number, name: string) => [
              fmtMoney(value, currency),
              name === "income" ? "Ingresos" : "Gastos",
            ]}
          />
          <Legend formatter={(value) => (value === "income" ? "Ingresos" : "Gastos")} />
          <Bar dataKey="income" fill="#10b981" radius={[8, 8, 0, 0]} />
          <Bar dataKey="expense" fill="#f97316" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const NetWorthHistoryChart = ({
  data,
  currency,
}: {
  data: Array<{ label: string; value: number }>;
  currency: Currency;
}) => {
  if (!data.length) return <EmptyChartState message="Todavia no hay patrimonio historico para mostrar." />;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={axisTick}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value: number) => [fmtMoney(value, currency), "Patrimonio"]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#38bdf8"
            strokeWidth={3}
            dot={{ r: 3, fill: "#38bdf8" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const CategoryExpenseDonut = ({
  items,
  currency,
}: {
  items: Array<{ label: string; value: number; color: string; icon?: string }>;
  currency: Currency;
}) => {
  const total = items.reduce((acc, item) => acc + item.value, 0);
  if (!items.length || total <= 0) {
    return <EmptyChartState message="Todavia no hay gastos categorizados en este periodo." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="label"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={2}
            >
              {items.map((item) => (
                <Cell key={item.label} fill={item.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 12 }}
              labelStyle={{ color: "#e2e8f0" }}
              formatter={(value: number, _name, entry) => [
                fmtMoney(value, currency),
                `${(entry.payload as { icon?: string; label: string }).icon ?? ""} ${(entry.payload as { label: string }).label}`.trim(),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const share = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-100">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: item.color }} />
                    <span className="align-middle">
                      {item.icon ? `${item.icon} ` : ""}
                      {item.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{share.toFixed(1)}% del total</div>
                </div>
                <div className="text-sm font-medium text-slate-100">{fmtMoney(item.value, currency)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
