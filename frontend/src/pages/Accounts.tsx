import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  useAccounts,
  useCreateAccount,
  useCreditCardStatus,
  useDeleteAccount,
  useUpdateAccount,
  usePayCreditCard,
  useRates,
} from "../hooks/queries";
import { convertStoredAmount, useCurrencyStore } from "../lib/currency";
import { dateInputToIso, fmtDate, fmtMoney, localDateInputValue } from "../lib/money";
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
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    dueMonthOffset: z.coerce.number().int().min(0).max(1).optional(),
    creditLimit: z.string().regex(/^\d+(\.\d+)?$/, "inválido").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "credit_card") {
      if (!data.closingDay)
        ctx.addIssue({ code: "custom", path: ["closingDay"], message: "requerido" });
      if (!data.dueDay)
        ctx.addIssue({
          code: "custom",
          path: ["dueDay"],
          message: "requerido",
        });
      if (data.dueMonthOffset === undefined)
        ctx.addIssue({ code: "custom", path: ["dueMonthOffset"], message: "requerido" });
      if (data.dueMonthOffset === 0 && data.dueDay !== undefined &&
          data.closingDay !== undefined && data.dueDay <= data.closingDay)
        ctx.addIssue({ code: "custom", path: ["dueDay"], message: "El vencimiento debe ser posterior al cierre" });
      if (!data.creditLimit)
        ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "requerido" });
    }
  });
type FormIn = z.infer<typeof FormSchema>;

export default function AccountsPage() {
  const accountsQ = useAccounts();
  const ratesQ = useRates();
  const createAcc = useCreateAccount();
  const updateAcc = useUpdateAccount();
  const delAcc = useDeleteAccount();
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { displayCurrency } = useCurrencyStore();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormIn>({
    resolver: zodResolver(FormSchema),
    defaultValues: { type: "checking", currency: "ARS", balance: "0", dueMonthOffset: 1 },
  });
  const type = watch("type");

  const onSubmit = async (data: FormIn) => {
    try {
      const cardFields = data.type === "credit_card"
        ? { closingDay: data.closingDay, dueDay: data.dueDay, dueMonthOffset: data.dueMonthOffset, creditLimit: data.creditLimit }
        : {};
      if (editingAccount) {
        await updateAcc.mutateAsync({ id: editingAccount.id, name: data.name, ...cardFields });
      } else {
        await createAcc.mutateAsync({ name: data.name, type: data.type, currency: data.currency, balance: data.balance, ...cardFields });
      }
      reset();
      setEditingAccount(null);
      setShowForm(false);
      setError(null);
    } catch (cause) {
      setError(getErrorMessage(cause, "No pudimos guardar la cuenta."));
    }
  };

  const startEdit = (account: Account) => {
    reset({ name: account.name, type: account.type, currency: account.currency, balance: account.balance,
      closingDay: account.closingDay ?? undefined, dueDay: account.dueDay ?? undefined,
      dueMonthOffset: account.dueMonthOffset ?? 1,
      creditLimit: account.creditLimit ?? undefined });
    setEditingAccount(account);
    setShowForm(true);
    setError(null);
  };

  const deleteAccount = async (account: Account) => {
    if (!window.confirm(`¿Eliminar la cuenta ${account.name}? Esta acción no se puede deshacer.`)) return;
    try {
      await delAcc.mutateAsync(account.id);
      setError(null);
    } catch (cause) {
      setError(getErrorMessage(cause, "No pudimos eliminar la cuenta. Si tiene movimientos, primero hay que resolverlos."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuentas</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingAccount(null); reset(); setError(null); }}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {showForm ? "Cancelar" : "+ Nueva"}
        </button>
      </div>

      {error && <div role="alert" className="rounded-md border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</div>}

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-3"
        >
          <Field label="Nombre" error={errors.name?.message}>
            <input {...register("name")} className={inputCls} />
          </Field>
          <Field label="Tipo">
            <select {...register("type")} className={inputCls} disabled={!!editingAccount}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moneda">
            <select {...register("currency")} className={inputCls} disabled={!!editingAccount}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </Field>
          <Field label="Saldo inicial" error={errors.balance?.message}>
            <input {...register("balance")} className={inputCls} placeholder="0" disabled={!!editingAccount} />
          </Field>
          {type === "credit_card" && (
            <>
              <Field label="Día de cierre (1-31)" error={errors.closingDay?.message}>
                <input type="number" {...register("closingDay")} className={inputCls} />
              </Field>
              <Field label="Día de vencimiento (1-31)" error={errors.dueDay?.message}>
                <input
                  type="number"
                  {...register("dueDay")}
                  className={inputCls}
                />
              </Field>
              <Field label="Vence en" error={errors.dueMonthOffset?.message}>
                <select {...register("dueMonthOffset", { valueAsNumber: true })} className={inputCls}>
                  <option value={0}>El mismo mes del cierre</option>
                  <option value={1}>El mes siguiente</option>
                </select>
              </Field>
              <p className="sm:col-span-3 text-xs text-slate-400">Se repetirá todos los meses. Si el mes es más corto, se usará su último día; si eso hace coincidir cierre y vencimiento, vencerá al día siguiente. El banco puede mover fechas por feriados; verificá el resumen cuando eso ocurra.</p>
              <Field label="Límite de crédito" error={errors.creditLimit?.message}>
                <input {...register("creditLimit")} className={inputCls} />
              </Field>
            </>
          )}
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={createAcc.isPending || updateAcc.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {createAcc.isPending || updateAcc.isPending ? "Guardando…" : editingAccount ? "Guardar cambios" : "Crear cuenta"}
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
            onEdit={() => startEdit(a)}
            onDelete={() => void deleteAccount(a)}
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
  onEdit,
  onDelete,
}: {
  account: Account;
  allAccounts: Account[];
  blueRate: string | null;
  displayCurrency: "ARS" | "USD";
  onEdit: () => void;
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
        <div className="flex gap-3">
          <button onClick={onEdit} className="text-xs text-slate-300 hover:text-white">Editar</button>
          <button onClick={onDelete} className="text-xs text-slate-500 hover:text-rose-400">Eliminar</button>
        </div>
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
              {ccQ.data.dueDay === null && (
                <div className="rounded border border-amber-800 bg-amber-950/30 p-2 text-amber-300">
                  Esta tarjeta usa el cálculo anterior por cantidad de días. Editala una vez para fijar el día de vencimiento de todos los meses.
                </div>
              )}
              <div>
                Cierre del resumen a vencer:{" "}
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
                Próximo cierre: <span className="text-slate-100">{fmtDate(ccQ.data.nextCloseDate)}</span>
              </div>
              <div>
                Próximo vencimiento: <span className="text-slate-100">{fmtDate(ccQ.data.nextDueDate)}</span>
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
  const [date, setDate] = useState(localDateInputValue);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!sourceId || !amount) return;
    try {
      await pay.mutateAsync({ ccAccountId: cc.id, sourceAccountId: sourceId, amount, currency,
        transactionDate: dateInputToIso(date), description: description || undefined });
      onClose();
    } catch (cause) {
      setError(getErrorMessage(cause, "No pudimos registrar el pago."));
    }
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
              {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
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

function getErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  if (response?.data?.error === "account_has_transactions") {
    return "Esta cuenta tiene movimientos. No se puede eliminar ni cambiar su saldo, tipo o moneda directamente.";
  }
  const message = response?.data?.message ?? response?.data?.error;
  return typeof message === "string" && message.trim() ? message.replaceAll("_", " ") : fallback;
}
