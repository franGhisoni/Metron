import { zodResolver } from "@hookform/resolvers/zod";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
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
import type { Transaction } from "../lib/types";

const FormSchema = z.object({
  accountId: z.string().min(1, "requerido"),
  categoryId: z.string().optional(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "monto invalido"),
  currency: z.enum(["ARS", "USD"]),
  description: z.string().optional(),
  transactionDate: z.string().min(1),
  status: z.enum(["paid", "pending", "scheduled"]),
  isRecurring: z.boolean().default(false),
  recurringRule: z.enum(["weekly", "biweekly", "monthly", "yearly"]).optional(),
});

type FormIn = z.infer<typeof FormSchema>;
type FormMode = "quick" | "normal";
type ListPreset = "month" | "recent" | "all";
type TxFilterType = "" | "income" | "expense" | "transfer";
type StoredQuickDraft = Pick<FormIn, "accountId" | "categoryId" | "type" | "currency" | "status">;

const QUICK_DRAFT_KEY = "metron:transactions:quick-draft";
const RECENT_LIMIT = 20;

const today = () => new Date().toISOString().slice(0, 10);

const getBaseDefaults = (): FormIn => ({
  accountId: "",
  categoryId: "",
  type: "expense",
  amount: "",
  currency: "ARS",
  description: "",
  transactionDate: today(),
  status: "paid",
  isRecurring: false,
  recurringRule: "monthly",
});

export default function TransactionsPage() {
  const [filterType, setFilterType] = useState<TxFilterType>("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [listPreset, setListPreset] = useState<ListPreset>("month");
  const [formMode, setFormMode] = useState<FormMode>("quick");
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const txQ = useTransactions(
    buildTransactionParams(listPreset, filterType, filterCategoryId || undefined)
  );
  const createTx = useCreateTransaction();
  const delTx = useDeleteTransaction();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<FormIn>({
    resolver: zodResolver(FormSchema),
    defaultValues: getBaseDefaults(),
  });

  const currentType = watch("type");
  const selectedStatus = watch("status");
  const isRecurring = watch("isRecurring");
  const selectedAccountId = watch("accountId");
  const selectedCategoryId = watch("categoryId");
  const selectedAccount = (accountsQ.data ?? []).find((account) => account.id === selectedAccountId);
  const isCcAccount = selectedAccount?.type === "credit_card";
  const filteredCats = (categoriesQ.data ?? []).filter(
    (category) => currentType === "transfer" || category.type === currentType
  );

  useEffect(() => {
    const storedDraft = loadStoredQuickDraft();
    if (!storedDraft) return;
    reset({
      ...getBaseDefaults(),
      ...storedDraft,
      transactionDate: today(),
    });
    if (storedDraft.status !== "paid") {
      setFormMode("normal");
    }
  }, [reset]);

  useEffect(() => {
    if (accountsQ.isLoading || !selectedAccountId) return;
    const accountExists = (accountsQ.data ?? []).some((account) => account.id === selectedAccountId);
    if (!accountExists) {
      setValue("accountId", "");
    }
  }, [accountsQ.data, accountsQ.isLoading, selectedAccountId, setValue]);

  useEffect(() => {
    if (categoriesQ.isLoading) return;
    if (!selectedCategoryId) return;
    if (currentType === "transfer") {
      setValue("categoryId", "");
      return;
    }

    const stillValid = filteredCats.some((category) => category.id === selectedCategoryId);
    if (!stillValid) {
      setValue("categoryId", "");
    }
  }, [categoriesQ.isLoading, currentType, filteredCats, selectedCategoryId, setValue]);

  useEffect(() => {
    if (categoriesQ.isLoading || !filterCategoryId) return;
    const filterCategory = (categoriesQ.data ?? []).find(
      (category) => category.id === filterCategoryId
    );
    if (!filterCategory) {
      setFilterCategoryId("");
      return;
    }
    if (filterType && filterCategory.type !== filterType) {
      setFilterCategoryId("");
    }
  }, [categoriesQ.data, categoriesQ.isLoading, filterCategoryId, filterType]);

  const onSubmit = async (data: FormIn) => {
    const effectiveStatus =
      formMode === "quick" || isCcAccount ? "paid" : data.status;
    const nextQuickDraft: StoredQuickDraft = {
      accountId: data.accountId,
      categoryId: data.type === "transfer" ? "" : (data.categoryId ?? ""),
      type: data.type,
      currency: data.currency,
      status: effectiveStatus,
    };

    await createTx.mutateAsync({
      accountId: data.accountId,
      categoryId: data.type === "transfer" ? undefined : data.categoryId || undefined,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description || undefined,
      transactionDate: new Date(data.transactionDate + "T12:00:00Z").toISOString(),
      status: effectiveStatus,
      isRecurring: formMode === "normal" ? data.isRecurring : false,
      recurringRule:
        formMode === "normal" && data.isRecurring ? (data.recurringRule ?? "monthly") : undefined,
    });

    persistStoredQuickDraft(nextQuickDraft);
    reset({
      ...getBaseDefaults(),
      ...nextQuickDraft,
      transactionDate: today(),
    });
    setPrefillNote("Formulario listo para cargar otro movimiento parecido.");
    setFocus("amount");
  };

  const repeatTransaction = (transaction: Transaction) => {
    const nextQuickDraft: StoredQuickDraft = {
      accountId: transaction.accountId,
      categoryId: transaction.type === "transfer" ? "" : (transaction.categoryId ?? ""),
      type: transaction.type,
      currency: transaction.currency,
      status: transaction.status,
    };
    const nextMode: FormMode =
      transaction.status !== "paid" || transaction.isRecurring ? "normal" : "quick";

    persistStoredQuickDraft(nextQuickDraft);
    reset({
      ...getBaseDefaults(),
      ...nextQuickDraft,
      amount: transaction.currency === "ARS" ? transaction.amountArs : transaction.amountUsd,
      description: transaction.description ?? "",
      transactionDate: today(),
      isRecurring: false,
      recurringRule: "monthly",
    });
    setFormMode(nextMode);
    setPrefillNote("Copiamos el movimiento al formulario para que lo ajustes y guardes.");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setTimeout(() => setFocus("amount"), 0);
  };

  const accMap = Object.fromEntries((accountsQ.data ?? []).map((account) => [account.id, account]));
  const catMap = Object.fromEntries((categoriesQ.data ?? []).map((category) => [category.id, category]));
  const txItems = txQ.data?.items ?? [];
  const categoryFilterOptions = (categoriesQ.data ?? []).filter(
    (category) => !filterType || category.type === filterType
  );
  const visibleTotals = summarizeVisibleTransactions(txItems);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <p className="mt-1 text-sm text-slate-400">
          Quick add para lo cotidiano, carga normal para casos especiales, y lista enfocada en lo
          que mas sirve ver.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Carga</div>
            <p className="mt-1 text-sm text-slate-400">
              El quick add deja afuera friccion innecesaria. El modo normal mantiene control fino.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-1">
            <ModeButton
              active={formMode === "quick"}
              onClick={() => setFormMode("quick")}
              label="Quick add"
            />
            <ModeButton
              active={formMode === "normal"}
              onClick={() => setFormMode("normal")}
              label="Add normal"
            />
          </div>
        </div>

        {prefillNote && (
          <div className="mb-4 rounded-md border border-brand-900/60 bg-brand-950/30 px-3 py-2 text-xs text-brand-200">
            {prefillNote}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tipo" error={errors.type?.message}>
              <select
                {...register("type", {
                  onChange: () => setPrefillNote(null),
                })}
                className={selectCls}
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
                <option value="transfer">Transferencia</option>
              </select>
            </Field>

            <Field label="Cuenta" error={errors.accountId?.message}>
              <select
                {...register("accountId", {
                  onChange: () => setPrefillNote(null),
                })}
                className={selectCls}
              >
                <option value="">-</option>
                {(accountsQ.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Categoria">
              <select
                {...register("categoryId", {
                  onChange: () => setPrefillNote(null),
                })}
                className={selectCls}
                disabled={currentType === "transfer"}
              >
                <option value="">-</option>
                {filteredCats.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Fecha" error={errors.transactionDate?.message}>
              <input type="date" {...register("transactionDate")} className={inputCls} />
            </Field>

            <Field label="Monto" error={errors.amount?.message}>
              <div className="flex gap-2">
                <input
                  {...register("amount", {
                    onChange: () => setPrefillNote(null),
                  })}
                  className={inputCls}
                  placeholder="0.00"
                />
                <select {...register("currency")} className={selectCls + " w-24"}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </Field>

            <Field label="Descripcion">
              <input
                {...register("description", {
                  onChange: () => setPrefillNote(null),
                })}
                className={inputCls}
                placeholder="Opcional"
              />
            </Field>

            <div className="sm:col-span-2 lg:col-span-2">
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
                Tip rapido: usa "Repetir" en un movimiento anterior para traer cuenta, categoria,
                monto y descripcion al formulario.
              </div>
            </div>
          </div>

          {formMode === "normal" && (
            <div className="grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              {!isCcAccount && (
                <Field label="Estado">
                  <select {...register("status")} className={selectCls}>
                    <option value="paid">Pagado</option>
                    <option value="pending">Pendiente</option>
                    <option value="scheduled">Programado</option>
                  </select>
                </Field>
              )}

              <Field label="Recurrente">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      {...register("isRecurring")}
                      className="h-4 w-4 accent-brand-500"
                    />
                    <span className="text-slate-300">Si</span>
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

              {isCcAccount && (
                <div className="sm:col-span-2 lg:col-span-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                    En tarjetas de credito las compras se guardan siempre como pagadas porque la
                    deuda se controla desde el resumen de la tarjeta.
                  </div>
                </div>
              )}
            </div>
          )}

          {formMode === "quick" && !isCcAccount && selectedStatus !== "paid" && (
            <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              En quick add los movimientos se guardan como pagados para reducir pasos. Si queres
              usar pendiente o programado, cambia a Add normal.
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                const storedDraft = loadStoredQuickDraft();
                reset({
                  ...getBaseDefaults(),
                  ...(storedDraft ?? {}),
                  transactionDate: today(),
                });
                setPrefillNote(null);
              }}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={createTx.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {createTx.isPending
                ? "Guardando..."
                : formMode === "quick"
                  ? "Agregar rapido"
                  : "Agregar movimiento"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Lista</div>
            <p className="mt-1 text-sm text-slate-400">
              Empezamos mostrando lo mas util: este mes o tus ultimos movimientos.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Rango</div>
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-1">
                <ModeButton
                  active={listPreset === "month"}
                  onClick={() => setListPreset("month")}
                  label="Este mes"
                />
                <ModeButton
                  active={listPreset === "recent"}
                  onClick={() => setListPreset("recent")}
                  label="Ultimos"
                />
                <ModeButton
                  active={listPreset === "all"}
                  onClick={() => setListPreset("all")}
                  label="Todos"
                />
              </div>
            </div>

            <Field label="Tipo">
              <select
                value={filterType}
                onChange={(event) => {
                  setFilterType(event.target.value as TxFilterType);
                }}
                className={selectCls}
              >
                <option value="">Todos</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
                <option value="transfer">Transferencias</option>
              </select>
            </Field>

            <Field label="Categoria">
              <select
                value={filterCategoryId}
                onChange={(event) => setFilterCategoryId(event.target.value)}
                className={selectCls}
              >
                <option value="">Todos</option>
                {categoryFilterOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <div className="grid gap-3 border-b border-slate-800 bg-slate-950/70 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Gastos visibles"
              tone="expense"
              primary={fmtMoney(visibleTotals.expense.ars, "ARS")}
              secondary={fmtMoney(visibleTotals.expense.usd, "USD")}
            />
            <SummaryCard
              label="Ingresos visibles"
              tone="income"
              primary={fmtMoney(visibleTotals.income.ars, "ARS")}
              secondary={fmtMoney(visibleTotals.income.usd, "USD")}
            />
            <SummaryCard
              label="Neto visible"
              tone={visibleTotals.net.ars.startsWith("-") ? "expense" : "income"}
              primary={fmtMoney(visibleTotals.net.ars, "ARS")}
              secondary={fmtMoney(visibleTotals.net.usd, "USD")}
            />
            <SummaryCard
              label="Movimientos"
              primary={String(visibleTotals.count)}
              secondary="segun filtros activos"
            />
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Descripcion</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {txItems.map((transaction) => {
                const account = accMap[transaction.accountId];
                const category = transaction.categoryId ? catMap[transaction.categoryId] : null;
                const sign =
                  transaction.type === "expense"
                    ? "-"
                    : transaction.type === "income"
                      ? "+"
                      : "";
                const displayAmount =
                  transaction.currency === "ARS" ? transaction.amountArs : transaction.amountUsd;

                return (
                  <tr
                    key={transaction.id}
                    className="border-t border-slate-800 hover:bg-slate-900/60"
                  >
                    <td className="px-3 py-2 text-slate-400">{fmtDate(transaction.transactionDate)}</td>
                    <td className="px-3 py-2">
                      {(transaction.isRecurring || transaction.recurringParentId) && (
                        <span
                          title={
                            transaction.isRecurring
                              ? "Plantilla recurrente"
                              : "Generada por recurrencia"
                          }
                          className="mr-1 text-indigo-400"
                        >
                          ↻
                        </span>
                      )}
                      {transaction.description ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {category ? (
                        <span>
                          {category.icon} {category.name}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{account?.name ?? "?"}</td>
                    <td
                      className={
                        "px-3 py-2 text-right font-medium " +
                        (transaction.type === "expense"
                          ? "text-rose-400"
                          : transaction.type === "income"
                            ? "text-emerald-400"
                            : "text-slate-200")
                      }
                    >
                      {sign}
                      {fmtMoney(displayAmount, transaction.currency)}
                    </td>
                    <td className="px-3 py-2">
                      {account?.type === "credit_card" ? (
                        <span className="text-xs text-slate-500">-</span>
                      ) : (
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                          {transaction.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => repeatTransaction(transaction)}
                          className="text-xs text-slate-400 hover:text-brand-300"
                        >
                          Repetir
                        </button>
                        <button
                          type="button"
                          onClick={() => void delTx.mutate(transaction.id)}
                          className="text-xs text-slate-500 hover:text-rose-400"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!txQ.isLoading && txItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No hay movimientos para este filtro.
                  </td>
                </tr>
              )}

              {txQ.isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Cargando movimientos...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-3 py-1.5 text-sm transition " +
        (active
          ? "bg-brand-600 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white")
      }
    >
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  primary,
  secondary,
  tone = "neutral",
}: {
  label: string;
  primary: string;
  secondary: string;
  tone?: "income" | "expense" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={
          "mt-1 text-lg font-semibold " +
          (tone === "income"
            ? "text-emerald-400"
            : tone === "expense"
              ? "text-rose-400"
              : "text-slate-100")
        }
      >
        {primary}
      </div>
      <div className="text-xs text-slate-400">{secondary}</div>
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

function buildTransactionParams(
  listPreset: ListPreset,
  filterType: TxFilterType,
  categoryId?: string
) {
  const params: {
    type?: "income" | "expense" | "transfer";
    categoryId?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {};

  if (filterType) {
    params.type = filterType;
  }

  if (categoryId) {
    params.categoryId = categoryId;
  }

  if (listPreset === "recent") {
    params.limit = RECENT_LIMIT;
    return params;
  }

  if (listPreset === "month") {
    const now = new Date();
    params.from = startOfMonth(now).toISOString();
    params.to = endOfMonth(now).toISOString();
    params.limit = 200;
    return params;
  }

  params.limit = 200;
  return params;
}

function summarizeVisibleTransactions(transactions: Transaction[]) {
  let expenseArs = new Decimal(0);
  let expenseUsd = new Decimal(0);
  let incomeArs = new Decimal(0);
  let incomeUsd = new Decimal(0);

  for (const transaction of transactions) {
    const ars = new Decimal(transaction.amountArs);
    const usd = new Decimal(transaction.amountUsd);

    if (transaction.type === "expense") {
      expenseArs = expenseArs.plus(ars);
      expenseUsd = expenseUsd.plus(usd);
      continue;
    }

    if (transaction.type === "income") {
      incomeArs = incomeArs.plus(ars);
      incomeUsd = incomeUsd.plus(usd);
    }
  }

  return {
    count: transactions.length,
    expense: {
      ars: expenseArs.toString(),
      usd: expenseUsd.toString(),
    },
    income: {
      ars: incomeArs.toString(),
      usd: incomeUsd.toString(),
    },
    net: {
      ars: incomeArs.minus(expenseArs).toString(),
      usd: incomeUsd.minus(expenseUsd).toString(),
    },
  };
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function loadStoredQuickDraft(): StoredQuickDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(QUICK_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredQuickDraft>;
    return {
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : "",
      categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : "",
      type:
        parsed.type === "income" || parsed.type === "expense" || parsed.type === "transfer"
          ? parsed.type
          : "expense",
      currency: parsed.currency === "USD" ? "USD" : "ARS",
      status:
        parsed.status === "pending" || parsed.status === "scheduled" ? parsed.status : "paid",
    };
  } catch {
    return null;
  }
}

function persistStoredQuickDraft(draft: StoredQuickDraft) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(QUICK_DRAFT_KEY, JSON.stringify(draft));
}
