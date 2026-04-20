import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  useAccounts,
  useCreateAccount,
  useCreditCardStatus,
  useDeleteAccount,
} from "../hooks/queries";
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
  const createAcc = useCreateAccount();
  const delAcc = useDeleteAccount();
  const [showForm, setShowForm] = useState(false);

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
          <AccountCard key={a.id} account={a} onDelete={() => void delAcc.mutate(a.id)} />
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
  onDelete,
}: {
  account: Account;
  onDelete: () => void;
}) => {
  const ccQ = useCreditCardStatus(account.type === "credit_card" ? account.id : null);
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
        {fmtMoney(account.balance, account.currency)}
      </div>
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
                Resumen actual:{" "}
                <span className="text-slate-100">
                  {fmtMoney(
                    account.currency === "ARS"
                      ? ccQ.data.currentStatement.totalArs
                      : ccQ.data.currentStatement.totalUsd,
                    account.currency
                  )}
                </span>
              </div>
              <div>
                Próximo resumen:{" "}
                <span className="text-slate-100">
                  {fmtMoney(
                    account.currency === "ARS"
                      ? ccQ.data.nextStatement.totalArs
                      : ccQ.data.nextStatement.totalUsd,
                    account.currency
                  )}
                </span>
              </div>
            </>
          ) : (
            <div className="text-slate-500">Cargando estado de tarjeta…</div>
          )}
        </div>
      )}
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
