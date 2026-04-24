import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  useAccounts,
  useCreateAccount,
  useCreditCardStatus,
  useDeleteAccount,
  usePayCreditCard,
  useRates,
} from "../hooks/queries";
import { convertStoredAmount, useCurrencyStore } from "../lib/currency";
import { fmtDate, fmtMoney } from "../lib/money";
import type { Account } from "../lib/types";

const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "investment",
  "crypto_wallet",
  "other",
] as const;

const FormSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(ACCOUNT_TYPES),
    currency: z.enum(["ARS", "USD"]),
    balance: z.string().regex(/^-?\d+(\.\d+)?$/, "inválido").default("0"),
    closingDay: z.coerce.number().int().min(1).max(31).optional(),
    dueDaysAfterClosing: z.coerce.number().int().min(0).max(60).optional(),
    creditLimit: z.string().regex(/^\d+(\.\d+)?$/, "inválido").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "credit_card") {
      if (!data.closingDay)
        ctx.addIssue({ code: "custom", path: ["closingDay"], message: "requerido" });
      if (data.dueDaysAfterClosing === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["dueDaysAfterClosing"],
          message: "requerido",
        });
      if (!data.creditLimit)
        ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "requerido" });
    }
  });
type FormIn = z.infer<typeof FormSchema>;

export default function AccountsPage() {
  const accountsQ = useAccounts();
  const ratesQ = useRates();
  const createAcc = useCreateAccount();
  const delAcc = useDeleteAccount();
  const [showForm, setShowForm] = useState(false);
  const { displayCurrency } = useCurrencyStore();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormIn>({
    resolver: zodResolver(FormSchema),
    defaultValues: { type: "checking", currency: "ARS", balance: "0" },
  });
  const type = watch("type");

  const onSubmit = async (data: FormIn) => {
    await createAcc.mutateAsync({
      name: data.name,
      type: data.type,
      currency: data.currency,
      balance: data.balance,
      ...(data.type === "credit_card"
        ? {
            closingDay: data.closingDay,
            dueDaysAfterClosing: data.dueDaysAfterClosing,
            creditLimit: data.creditLimit,
          }
        : {}),
    });
    reset();
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuentas</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {showForm ? "Cancelar" : "+ Nueva"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-3"
        >
          <Field label="Nombre" error={errors.name?.message}>
            <input {...register("name")} className={inputCls} />
          </Field>
          <Field label="Tipo">
            <select {...register("type")} className={inputCls}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moneda">
            <select {...register("currency")} className={inputCls}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </Field>
          <Field label="Saldo inicial" error={errors.balance?.message}>
            <input {...register("balance")} className={inputCls} placeholder="0" />
          </Field>
          {type === "credit_card" && (
            <>
              <Field label="Día de cierre (1-31)" error={errors.closingDay?.message}>
                <input type="number" {...register("closingDay")} className={inputCls} />
              </Field>
              <Field label="Días hasta vencimiento" error={errors.dueDaysAfterClosing?.message}>
                <input
                  type="number"
                  {...register("dueDaysAfterClosing")}
                  className={inputCls}
                />
              </Field>
              <Field label="Límite de crédito" error={errors.creditLimit?.message}>
                <input {...register("creditLimit")} className={inputCls} />
              </Field>
            </>
          )}
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={createAcc.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {createAcc.isPending ? "Guardando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(accountsQ.data ?? []).map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            allAccounts={accountsQ.data ?? []}
            blueRate={ratesQ.data?.rates.blue ?? null}
            displayCurrency={displayCurrency}
            onDelete={() => void delAcc.mutate(a.id)}
          />
        ))}
        {accountsQ.data?.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-slate-500">
            Aún no agregaste cuentas.
          </div>
        )}
      </div>
    </div>
  );
}

const AccountCard = ({
  account,
  allAccounts,
  blueRate,
  displayCurrency,
  onDelete,
}: {
  account: Account;
  allAccounts: Account[];
  blueRate: string | null;
  displayCurrency: "ARS" | "USD";
  onDelete: () => void;
}) => {
  const ccQ = useCreditCardStatus(account.type === "credit_card" ? account.id : null);
  const [payOpen, setPayOpen] = useState(false);
  const canConvert = !!blueRate;
  const displayBalance =
    canConvert && blueRate
      ? convertStoredAmount(account.balance, account.currency, displayCurrency, blueRate)
      : account.balance;
  const showingConverted = displayCurrency !== account.currency && canConvert;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm uppercase tracking-wide text-slate-400">{account.type}</div>
          <div className="text-lg font-semibold">{account.name}</div>
        </div>
        <button onClick={onDelete} className="text-xs text-slate-500 hover:text-rose-400">
          Eliminar
        </button>
      </div>
      <div className="mt-3 text-2xl font-semibold">
        {fmtMoney(displayBalance, showingConverted ? displayCurrency : account.currency)}
      </div>
      {showingConverted && (
        <div className="mt-1 text-xs text-slate-500">
          Original: {fmtMoney(account.balance, account.currency)}
        </div>
      )}
      {account.type === "credit_card" && (
        <div className="mt-4 space-y-1 rounded-md bg-slate-950/60 p-3 text-xs text-slate-300">
          {ccQ.data ? (
            <>
              <div>
                Cierre actual:{" "}
                <span className="text-slate-100">{fmtDate(ccQ.data.currentCloseDate)}</span>
              </div>
              <div>
                Vencimiento:{" "}
                <span className="text-slate-100">{fmtDate(ccQ.data.currentDueDate)}</span>
              </div>
              <div>
                Resumen actual:
                <StatementBreakdown ars={ccQ.data.currentStatement.ars} usd={ccQ.data.currentStatement.usd} />
              </div>
              <div>
                Próximo resumen:
                <StatementBreakdown ars={ccQ.data.nextStatement.ars} usd={ccQ.data.nextStatement.usd} />
              </div>
            </>
          ) : (
            <div className="text-slate-500">Cargando estado de tarjeta…</div>
          )}
          <div className="pt-2">
            <button
              onClick={() => setPayOpen(true)}
              className="w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
            >
              Pagar tarjeta
            </button>
          </div>
        </div>
      )}
      {payOpen && (
        <PayModal
          cc={account}
          sources={allAccounts.filter((a) => a.type !== "credit_card" && a.id !== account.id)}
          onClose={() => setPayOpen(false)}
        />
      )}
    </div>
  );
};

const StatementBreakdown = ({ ars, usd }: { ars: string; usd: string }) => {
  const hasArs = Number(ars) !== 0;
  const hasUsd = Number(usd) !== 0;
  if (!hasArs && !hasUsd) {
    return <span className="ml-1 text-slate-100">{fmtMoney("0", "ARS")}</span>;
  }
  return (
    <span className="ml-1 inline-flex flex-wrap gap-x-3 text-slate-100">
      {hasArs && <span>{fmtMoney(ars, "ARS")}</span>}
      {hasUsd && <span>{fmtMoney(usd, "USD")}</span>}
    </span>
  );
};

const PayModal = ({
  cc,
  sources,
  onClose,
}: {
  cc: Account;
  sources: Account[];
  onClose: () => void;
}) => {
  const pay = usePayCreditCard();
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">(cc.currency);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  const submit = async () => {
    if (!sourceId || !amount) return;
    await pay.mutateAsync({
      ccAccountId: cc.id,
      sourceAccountId: sourceId,
      amount,
      currency,
      transactionDate: new Date(date + "T12:00:00Z").toISOString(),
      description: description || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-base font-semibold">Pagar {cc.name}</div>
        {sources.length === 0 ? (
          <div className="text-sm text-slate-400">
            No tenés cuentas no-tarjeta para pagar desde.
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Cuenta origen
              </span>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className={inputCls}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.currency} · {fmtMoney(s.balance, s.currency)})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-400">Monto</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-slate-400">Moneda</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "ARS" | "USD")}
                  className={inputCls}
                >
                  <option>ARS</option>
                  <option>USD</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-400">Fecha</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Descripción (opcional)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submit()}
                disabled={pay.isPending || !sourceId || !amount}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {pay.isPending ? "Pagando…" : "Confirmar pago"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500";

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
    {error && <span className="text-xs text-red-400">{error}</span>}
  </label>
);
