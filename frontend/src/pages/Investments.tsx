import { zodResolver } from "@hookform/resolvers/zod";
import Decimal from "decimal.js";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  useCreateInvestment,
  useDeleteInvestment,
  useInvestmentSummary,
  useInvestments,
  useRates,
  useUpdateInvestment,
} from "../hooks/queries";
import { useCurrencyStore } from "../lib/currency";
import { fmtDate, fmtMoney, fmtPct } from "../lib/money";
import type { AssetType, Currency, Investment, InvestmentSummary } from "../lib/types";

const ASSET_TYPES: Array<{ value: AssetType; label: string }> = [
  { value: "cedear", label: "CEDEAR" },
  { value: "crypto", label: "Cripto" },
  { value: "bond", label: "Bono" },
  { value: "stock", label: "Accion" },
  { value: "fci", label: "FCI" },
  { value: "plazo_fijo", label: "Plazo fijo" },
  { value: "other", label: "Otro" },
];

const InvestmentSchema = z
  .object({
    symbol: z.string().trim().min(1, "requerido").max(30),
    name: z.string().trim().min(1, "requerido").max(120),
    assetType: z.enum(["crypto", "stock", "cedear", "bond", "plazo_fijo", "fci", "other"]),
    quantity: z.string().regex(/^\d+(\.\d+)?$/, "invalido"),
    purchasePrice: z.string().regex(/^\d+(\.\d+)?$/, "invalido"),
    purchaseCurrency: z.enum(["ARS", "USD"]),
    purchaseDate: z.string().min(1, "requerido"),
    exchangeRateAtPurchase: z.string().regex(/^\d+(\.\d+)?$/, "invalido").optional().or(z.literal("")),
    currentPrice: z.string().regex(/^\d+(\.\d+)?$/, "invalido").optional().or(z.literal("")),
    currentPriceCurrency: z.enum(["ARS", "USD"]),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.currentPrice && !data.currentPriceCurrency) {
      ctx.addIssue({
        code: "custom",
        path: ["currentPriceCurrency"],
        message: "requerido",
      });
    }
  });

type InvestmentForm = z.infer<typeof InvestmentSchema>;

const today = () => new Date().toISOString().slice(0, 10);

const defaultValues: InvestmentForm = {
  symbol: "",
  name: "",
  assetType: "cedear",
  quantity: "",
  purchasePrice: "",
  purchaseCurrency: "ARS",
  purchaseDate: today(),
  exchangeRateAtPurchase: "",
  currentPrice: "",
  currentPriceCurrency: "ARS",
  notes: "",
};

export default function InvestmentsPage() {
  const { displayCurrency } = useCurrencyStore();
  const investmentsQ = useInvestments();
  const summaryQ = useInvestmentSummary();
  const ratesQ = useRates();
  const createInvestment = useCreateInvestment();
  const updateInvestment = useUpdateInvestment();
  const deleteInvestment = useDeleteInvestment();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<InvestmentForm>({
    resolver: zodResolver(InvestmentSchema),
    defaultValues,
  });

  const purchaseCurrency = watch("purchaseCurrency");
  const currentPriceCurrency = watch("currentPriceCurrency");

  const sortedInvestments = useMemo(
    () =>
      [...(investmentsQ.data ?? [])].sort((left, right) =>
        new Decimal(getAmount(right.metrics.currentValue, displayCurrency))
          .minus(getAmount(left.metrics.currentValue, displayCurrency))
          .toNumber()
      ),
    [investmentsQ.data, displayCurrency]
  );

  const openCreate = () => {
    setEditing(null);
    reset({
      ...defaultValues,
      exchangeRateAtPurchase: ratesQ.data?.rates.blue ?? "",
    });
    setShowForm(true);
  };

  const openEdit = (investment: Investment) => {
    const priceCurrency = displayCurrency;
    setEditing(investment);
    reset({
      symbol: investment.symbol,
      name: investment.name,
      assetType: investment.assetType,
      quantity: investment.quantity,
      purchasePrice:
        priceCurrency === "ARS" ? investment.purchasePriceArs : investment.purchasePriceUsd,
      purchaseCurrency: priceCurrency,
      purchaseDate: investment.purchaseDate.slice(0, 10),
      exchangeRateAtPurchase: investment.exchangeRateAtPurchase,
      currentPrice:
        priceCurrency === "ARS"
          ? investment.currentPriceArs ?? investment.purchasePriceArs
          : investment.currentPriceUsd ?? investment.purchasePriceUsd,
      currentPriceCurrency: priceCurrency,
      notes: investment.notes ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    reset(defaultValues);
  };

  const onSubmit = async (data: InvestmentForm) => {
    const body = {
      symbol: data.symbol.trim(),
      name: data.name.trim(),
      assetType: data.assetType,
      quantity: data.quantity,
      purchasePrice: data.purchasePrice,
      purchaseCurrency: data.purchaseCurrency,
      purchaseDate: new Date(`${data.purchaseDate}T12:00:00Z`).toISOString(),
      exchangeRateAtPurchase: data.exchangeRateAtPurchase || undefined,
      currentPrice: data.currentPrice || undefined,
      currentPriceCurrency: data.currentPrice ? data.currentPriceCurrency : undefined,
      notes: data.notes?.trim() || undefined,
    };

    if (editing) {
      await updateInvestment.mutateAsync({ id: editing.id, ...body });
    } else {
      await createInvestment.mutateAsync(body);
    }
    closeForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inversiones</h1>
          <p className="mt-1 text-sm text-slate-400">
            Seguimiento manual de CEDEARs, cripto, bonos, acciones y fondos.
          </p>
        </div>
        <button
          onClick={showForm ? closeForm : openCreate}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {showForm ? "Cancelar" : "+ Nueva posicion"}
        </button>
      </div>

      <SummaryCards summary={summaryQ.data} currency={displayCurrency} />

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 md:grid-cols-4"
        >
          <Field label="Ticker" error={errors.symbol?.message}>
            <input {...register("symbol")} className={inputCls} placeholder="YPFD, GGAL, BTC" />
          </Field>
          <Field label="Nombre" error={errors.name?.message}>
            <input {...register("name")} className={inputCls} placeholder="YPF, Bitcoin..." />
          </Field>
          <Field label="Tipo">
            <select {...register("assetType")} className={inputCls}>
              {ASSET_TYPES.map((assetType) => (
                <option key={assetType.value} value={assetType.value}>
                  {assetType.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad" error={errors.quantity?.message}>
            <input {...register("quantity")} className={inputCls} placeholder="10" />
          </Field>
          <Field label={`Precio compra (${purchaseCurrency})`} error={errors.purchasePrice?.message}>
            <input {...register("purchasePrice")} className={inputCls} placeholder="0.00" />
          </Field>
          <Field label="Moneda compra">
            <select {...register("purchaseCurrency")} className={inputCls}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </Field>
          <Field label="Fecha compra" error={errors.purchaseDate?.message}>
            <input type="date" {...register("purchaseDate")} className={inputCls} />
          </Field>
          <Field label="TC compra" error={errors.exchangeRateAtPurchase?.message}>
            <input {...register("exchangeRateAtPurchase")} className={inputCls} placeholder="auto blue" />
          </Field>
          <Field label={`Precio actual (${currentPriceCurrency})`} error={errors.currentPrice?.message}>
            <input {...register("currentPrice")} className={inputCls} placeholder="opcional" />
          </Field>
          <Field label="Moneda actual">
            <select {...register("currentPriceCurrency")} className={inputCls}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </Field>
          <Field label="Notas">
            <input {...register("notes")} className={inputCls} placeholder="broker, parking, tesis..." />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={createInvestment.isPending || updateInvestment.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {createInvestment.isPending || updateInvestment.isPending
                ? "Guardando..."
                : editing
                  ? "Guardar"
                  : "Crear"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        {investmentsQ.isLoading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Cargando cartera...</div>
        ) : sortedInvestments.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Todavia no cargaste posiciones.
          </div>
        ) : (
          sortedInvestments.map((investment) => (
            <InvestmentRow
              key={investment.id}
              investment={investment}
              currency={displayCurrency}
              onEdit={() => openEdit(investment)}
              onDelete={() => void deleteInvestment.mutate(investment.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

const SummaryCards = ({
  summary,
  currency,
}: {
  summary: InvestmentSummary | undefined;
  currency: Currency;
}) => {
  const invested = summary ? getAmount(summary.invested, currency) : "0";
  const current = summary ? getAmount(summary.currentValue, currency) : "0";
  const pnl = summary ? getAmount(summary.pnl, currency) : "0";
  const pnlPct = summary?.pnlPct[currency.toLowerCase() as "ars" | "usd"] ?? null;
  const positive = new Decimal(pnl).gte(0);

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard title="Invertido" value={fmtMoney(invested, currency)} />
      <MetricCard title="Valor actual" value={fmtMoney(current, currency)} />
      <MetricCard
        title="Resultado"
        value={fmtMoney(pnl, currency)}
        tone={positive ? "pos" : "neg"}
      />
      <MetricCard title="Retorno" value={fmtPct(pnlPct)} tone={positive ? "pos" : "neg"} />
    </section>
  );
};

const InvestmentRow = ({
  investment,
  currency,
  onEdit,
  onDelete,
}: {
  investment: Investment;
  currency: Currency;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const current = getAmount(investment.metrics.currentValue, currency);
  const invested = getAmount(investment.metrics.invested, currency);
  const pnl = getAmount(investment.metrics.pnl, currency);
  const pnlPct = investment.metrics.pnlPct[currency.toLowerCase() as "ars" | "usd"];
  const positive = new Decimal(pnl).gte(0);

  return (
    <div className="grid gap-3 border-b border-slate-800 bg-slate-950/40 px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_8rem_9rem_9rem_8rem_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-slate-100">{investment.symbol}</div>
          <span className="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
            {assetLabel(investment.assetType)}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-slate-400">{investment.name}</div>
        <div className="mt-1 text-[11px] text-slate-500">
          Compra: {fmtDate(investment.purchaseDate)}
          {investment.lastPriceUpdatedAt ? ` · Precio: ${fmtDate(investment.lastPriceUpdatedAt)}` : ""}
        </div>
      </div>
      <Cell label="Cantidad" value={investment.quantity} />
      <Cell label="Invertido" value={fmtMoney(invested, currency)} />
      <Cell label="Actual" value={fmtMoney(current, currency)} />
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 lg:hidden">Resultado</div>
        <div className={positive ? "text-sm font-medium text-emerald-400" : "text-sm font-medium text-rose-400"}>
          {fmtMoney(pnl, currency)}
        </div>
        <div className="text-xs text-slate-500">{fmtPct(pnlPct)}</div>
      </div>
      <div className="flex gap-2 lg:justify-end">
        <button onClick={onEdit} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500">
          Editar
        </button>
        <button onClick={onDelete} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-500 hover:text-rose-300">
          Eliminar
        </button>
      </div>
    </div>
  );
};

const getAmount = (amount: { ars: string; usd: string }, currency: Currency) =>
  currency === "ARS" ? amount.ars : amount.usd;

const assetLabel = (assetType: AssetType) =>
  ASSET_TYPES.find((item) => item.value === assetType)?.label ?? assetType;

const MetricCard = ({
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

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-slate-500 lg:hidden">{label}</div>
    <div className="text-sm text-slate-200">{value}</div>
  </div>
);

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1">
    <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
    {children}
    {error && <span className="text-xs text-rose-400">{error}</span>}
  </label>
);

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500";
