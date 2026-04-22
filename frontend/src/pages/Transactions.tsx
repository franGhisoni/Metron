import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
} from "../hooks/queries";
import { fmtDate, fmtMoney } from "../lib/money";

const FormSchema = z.object({
  accountId: z.string().min(1, "requerido"),
  categoryId: z.string().optional(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "monto inválido"),
  currency: z.enum(["ARS", "USD"]),
  description: z.string().optional(),
  transactionDate: z.string().min(1),
  status: z.enum(["paid", "pending", "scheduled"]),
  isRecurring: z.boolean().default(false),
  recurringRule: z.enum(["weekly", "biweekly", "monthly", "yearly"]).optional(),
});
type FormIn = z.infer<typeof FormSchema>;

const today = () => new Date().toISOString().slice(0, 10);

export default function TransactionsPage() {
  const [filterType, setFilterType] = useState<"" | "income" | "expense" | "transfer">("");
  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const txQ = useTransactions({ limit: 100, ...(filterType ? { type: filterType } : {}) });
  const createTx = useCreateTransaction();
  const delTx = useDeleteTransaction();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormIn>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      type: "expense",
      currency: "ARS",
      status: "paid",
      transactionDate: today(),
      isRecurring: false,
    },
  });

  const currentType = watch("type");
  const isRecurring = watch("isRecurring");
  const selectedAccountId = watch("accountId");
  const selectedAccount = (accountsQ.data ?? []).find((a) => a.id === selectedAccountId);
  const isCcAccount = selectedAccount?.type === "credit_card";
  const filteredCats = (categoriesQ.data ?? []).filter(
    (c) => currentType === "transfer" || c.type === currentType
  );

  const onSubmit = async (data: FormIn) => {
    await createTx.mutateAsync({
      accountId: data.accountId,
      categoryId: data.categoryId || undefined,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description || undefined,
      transactionDate: new Date(data.transactionDate + "T12:00:00Z").toISOString(),
      status: isCcAccount ? "paid" : data.status,
      isRecurring: data.isRecurring,
      recurringRule: data.isRecurring ? (data.recurringRule ?? "monthly") : undefined,
    });
    reset({
      type: data.type,
      currency: data.currency,
      status: "paid",
      transactionDate: today(),
      accountId: data.accountId,
      isRecurring: false,
    });
  };

  const accMap = Object.fromEntries((accountsQ.data ?? []).map((a) => [a.id, a]));
  const catMap = Object.fromEntries((categoriesQ.data ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Movimientos</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Tipo" error={errors.type?.message}>
          <select {...register("type")} className={selectCls}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
            <option value="transfer">Transferencia</option>
          </select>
        </Field>
        <Field label="Cuenta" error={errors.accountId?.message}>
          <select {...register("accountId")} className={selectCls}>
            <option value="">—</option>
            {(accountsQ.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoría">
          <select {...register("categoryId")} className={selectCls}>
            <option value="">—</option>
            {filteredCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Monto" error={errors.amount?.message}>
          <div className="flex gap-2">
            <input {...register("amount")} className={inputCls} placeholder="0.00" />
            <select {...register("currency")} className={selectCls + " w-24"}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </div>
        </Field>
        <Field label="Fecha" error={errors.transactionDate?.message}>
          <input type="date" {...register("transactionDate")} className={inputCls} />
        </Field>
        {!isCcAccount && (
          <Field label="Estado">
            <select {...register("status")} className={selectCls}>
              <option value="paid">Pagado</option>
              <option value="pending">Pendiente</option>
              <option value="scheduled">Programado</option>
            </select>
          </Field>
        )}
        <Field label="Descripción">
          <input {...register("description")} className={inputCls} placeholder="Opcional" />
        </Field>
        <Field label="Recurrente">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("isRecurring")}
                className="h-4 w-4 accent-brand-500"
              />
              <span className="text-slate-300">Sí</span>
            </label>
            {isRecurring && (
              <select {...register("recurringRule")} className={selectCls + " flex-1"}>
                <option value="monthly">Mensual</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="yearly">Anual</option>
              </select>
            )}
          </div>
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={createTx.isPending}
            className="w-full rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {createTx.isPending ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-400">Filtrar:</span>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className={selectCls + " w-auto"}
        >
          <option value="">Todos</option>
          <option value="income">Ingresos</option>
          <option value="expense">Gastos</option>
          <option value="transfer">Transferencias</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Cuenta</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(txQ.data?.items ?? []).map((t) => {
              const acc = accMap[t.accountId];
              const cat = t.categoryId ? catMap[t.categoryId] : null;
              const sign = t.type === "expense" ? "-" : t.type === "income" ? "+" : "";
              const displayAmount = t.currency === "ARS" ? t.amountArs : t.amountUsd;
              return (
                <tr key={t.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                  <td className="px-3 py-2 text-slate-400">{fmtDate(t.transactionDate)}</td>
                  <td className="px-3 py-2">
                    {(t.isRecurring || t.recurringParentId) && (
                      <span
                        title={t.isRecurring ? "Plantilla recurrente" : "Generada por recurrencia"}
                        className="mr-1 text-indigo-400"
                      >
                        ↻
                      </span>
                    )}
                    {t.description ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {cat ? (
                      <span>
                        {cat.icon} {cat.name}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{acc?.name ?? "?"}</td>
                  <td
                    className={
                      "px-3 py-2 text-right font-medium " +
                      (t.type === "expense"
                        ? "text-rose-400"
                        : t.type === "income"
                          ? "text-emerald-400"
                          : "text-slate-200")
                    }
                  >
                    {sign}
                    {fmtMoney(displayAmount, t.currency)}
                  </td>
                  <td className="px-3 py-2">
                    {acc?.type === "credit_card" ? (
                      <span className="text-xs text-slate-500">—</span>
                    ) : (
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                        {t.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => void delTx.mutate(t.id)}
                      className="text-xs text-slate-500 hover:text-rose-400"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
            {txQ.data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Sin movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500";
const selectCls = inputCls;

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
