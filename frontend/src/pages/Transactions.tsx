import { zodResolver } from "@hookform/resolvers/zod";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { useForm, type UseFormSetFocus } from "react-hook-form";
import { z } from "zod";
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useGroups,
  useTransactions,
  useUpdateTransaction,
} from "../hooks/queries";
import { getPreferredAmountFromDual, useCurrencyStore } from "../lib/currency";
import { fmtDate, fmtMoney } from "../lib/money";
import type { Transaction } from "../lib/types";

const FormSchema = z.object({
  accountId: z.string().min(1, "requerido"),
  categoryId: z.string().optional(),
  groupIds: z.array(z.string()).default([]),
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
type TxFilterType = "income" | "expense" | "transfer";
type StoredQuickDraft = Pick<
  FormIn,
  "accountId" | "categoryId" | "groupIds" | "type" | "currency" | "status"
>;

const QUICK_DRAFT_KEY = "metron:transactions:quick-draft";
const RECENT_LIMIT = 20;
const TX_FILTER_OPTIONS: Array<{ value: TxFilterType; label: string }> = [
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Ingresos" },
  { value: "transfer", label: "Transferencias" },
];

const today = () => new Date().toISOString().slice(0, 10);

const getBaseDefaults = (): FormIn => ({
  accountId: "",
  categoryId: "",
  groupIds: [],
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
  const [filterTypes, setFilterTypes] = useState<TxFilterType[]>([]);
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([]);
  const [listPreset, setListPreset] = useState<ListPreset>("month");
  const [formMode, setFormMode] = useState<FormMode>("quick");
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const { displayCurrency } = useCurrencyStore();

  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const groupsQ = useGroups();
  const txQ = useTransactions(
    buildTransactionParams(listPreset, filterTypes, filterCategoryIds, filterGroupIds)
  );
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
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
  const selectedGroupIds = watch("groupIds");
  const selectedAccount = (accountsQ.data ?? []).find((account) => account.id === selectedAccountId);
  const isCcAccount = selectedAccount?.type === "credit_card";
  const filteredCats = (categoriesQ.data ?? []).filter(
    (category) => currentType === "transfer" || category.type === currentType
  );
  const isSubmitting = createTx.isPending || updateTx.isPending;

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
    if (categoriesQ.isLoading || !selectedCategoryId) return;
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
    if (groupsQ.isLoading || selectedGroupIds.length === 0) return;
    const availableIds = new Set((groupsQ.data ?? []).map((group) => group.id));
    const nextGroupIds = selectedGroupIds.filter((groupId) => availableIds.has(groupId));
    if (nextGroupIds.length !== selectedGroupIds.length) {
      setValue("groupIds", nextGroupIds);
    }
  }, [groupsQ.data, groupsQ.isLoading, selectedGroupIds, setValue]);

  useEffect(() => {
    if (categoriesQ.isLoading || filterCategoryIds.length === 0) return;
    const availableIds = new Set((categoriesQ.data ?? []).map((category) => category.id));
    setFilterCategoryIds((prev) => prev.filter((categoryId) => availableIds.has(categoryId)));
  }, [categoriesQ.data, categoriesQ.isLoading, filterCategoryIds.length]);

  useEffect(() => {
    if (groupsQ.isLoading || filterGroupIds.length === 0) return;
    const availableIds = new Set((groupsQ.data ?? []).map((group) => group.id));
    setFilterGroupIds((prev) => prev.filter((groupId) => availableIds.has(groupId)));
  }, [groupsQ.data, groupsQ.isLoading, filterGroupIds.length]);

  const resetToStoredDraft = () => {
    const storedDraft = loadStoredQuickDraft();
    setEditingTransaction(null);
    setSubmitError(null);
    setPrefillNote(null);
    setFormMode(storedDraft?.status && storedDraft.status !== "paid" ? "normal" : "quick");
    reset({
      ...getBaseDefaults(),
      ...(storedDraft ?? {}),
      transactionDate: today(),
    });
  };

  const onSubmit = async (data: FormIn) => {
    const effectiveStatus = formMode === "quick" || isCcAccount ? "paid" : data.status;
    const normalizedGroupIds = dedupeIds(data.groupIds);
    const nextQuickDraft: StoredQuickDraft = {
      accountId: data.accountId,
      categoryId: data.type === "transfer" ? "" : (data.categoryId ?? ""),
      groupIds: normalizedGroupIds,
      type: data.type,
      currency: data.currency,
      status: effectiveStatus,
    };
    const payload = {
      accountId: data.accountId,
      categoryId: data.type === "transfer" ? undefined : data.categoryId || undefined,
      groupIds: normalizedGroupIds,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description?.trim() ? data.description.trim() : undefined,
      transactionDate: new Date(data.transactionDate + "T12:00:00Z").toISOString(),
      status: effectiveStatus,
      isRecurring: formMode === "normal" ? data.isRecurring : false,
      recurringRule:
        formMode === "normal" && data.isRecurring ? (data.recurringRule ?? "monthly") : undefined,
    };

    try {
      setSubmitError(null);

      if (editingTransaction) {
        await updateTx.mutateAsync({
          id: editingTransaction.id,
          ...payload,
          categoryId: data.type === "transfer" ? null : (data.categoryId || null),
          recurringRule:
            formMode === "normal" && data.isRecurring ? (data.recurringRule ?? "monthly") : null,
        });

        persistStoredQuickDraft(nextQuickDraft);
        setEditingTransaction(null);
        reset({
          ...getBaseDefaults(),
          ...nextQuickDraft,
          transactionDate: today(),
        });
        setPrefillNote("Guardamos los cambios y dejamos el formulario listo para el siguiente movimiento.");
      } else {
        await createTx.mutateAsync(payload);
        persistStoredQuickDraft(nextQuickDraft);
        reset({
          ...getBaseDefaults(),
          ...nextQuickDraft,
          transactionDate: today(),
        });
        setPrefillNote("Formulario listo para cargar otro movimiento parecido.");
      }

      setFocus("amount");
    } catch (error) {
      setSubmitError(getErrorMessage(error, "No pudimos guardar el movimiento."));
    }
  };

  const repeatTransaction = (transaction: Transaction) => {
    const nextQuickDraft: StoredQuickDraft = {
      accountId: transaction.accountId,
      categoryId: transaction.type === "transfer" ? "" : (transaction.categoryId ?? ""),
      groupIds: transaction.groupIds,
      type: transaction.type,
      currency: transaction.currency,
      status: transaction.status,
    };
    const nextMode: FormMode =
      transaction.status !== "paid" || transaction.isRecurring ? "normal" : "quick";

    setEditingTransaction(null);
    setSubmitError(null);
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
    focusForm(setFocus);
  };

  const editTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setSubmitError(null);
    setFormMode(transaction.status === "paid" && !transaction.isRecurring ? "quick" : "normal");
    reset({
      accountId: transaction.accountId,
      categoryId: transaction.categoryId ?? "",
      groupIds: transaction.groupIds,
      type: transaction.type,
      amount: transaction.currency === "ARS" ? transaction.amountArs : transaction.amountUsd,
      currency: transaction.currency,
      description: transaction.description ?? "",
      transactionDate: transaction.transactionDate.slice(0, 10),
      status: transaction.status,
      isRecurring: transaction.isRecurring,
      recurringRule: transaction.recurringRule ?? "monthly",
    });
    setPrefillNote("Editando un movimiento existente. Cuando guardes, se actualiza este registro.");
    focusForm(setFocus);
  };

  const accMap = Object.fromEntries((accountsQ.data ?? []).map((account) => [account.id, account]));
  const catMap = Object.fromEntries((categoriesQ.data ?? []).map((category) => [category.id, category]));
  const groupMap = Object.fromEntries((groupsQ.data ?? []).map((group) => [group.id, group]));
  const txItems = txQ.data?.items ?? [];
  const visibleTotals = summarizeVisibleTransactions(txItems);
  const mirrorCurrency = displayCurrency === "ARS" ? "USD" : "ARS";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <p className="mt-1 text-sm text-slate-400">
          Carga rapida para el dia a dia, grupos para separar proyectos y una lista mas flexible
          para revisar lo que te importa.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              {editingTransaction ? "Edicion" : "Carga"}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {editingTransaction
                ? "Estas ajustando un movimiento ya guardado. Podes cambiar cuenta, categoria, grupos o monto."
                : "El quick add deja afuera friccion innecesaria. El modo normal mantiene control fino."}
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

        {submitError && (
          <div className="mb-4 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {submitError}
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
                Tip rapido: usa "Repetir" para clonar un movimiento parecido o "Editar" para tocar
                el registro original sin reescribirlo desde cero.
              </div>
            </div>
          </div>

          <Field label="Grupos">
            <ChecklistGrid
              emptyLabel="Todavia no tenes grupos. Podes crearlos desde Ajustes."
              options={(groupsQ.data ?? []).map((group) => ({
                value: group.id,
                label: group.name,
                tone: group.color,
                checked: selectedGroupIds.includes(group.id),
              }))}
              onToggle={(groupId) => {
                setPrefillNote(null);
                setValue("groupIds", toggleValue(selectedGroupIds, groupId));
              }}
            />
          </Field>

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
            {editingTransaction && (
              <button
                type="button"
                onClick={resetToStoredDraft}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
              >
                Cancelar edicion
              </button>
            )}
            <button
              type="button"
              onClick={resetToStoredDraft}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {isSubmitting
                ? "Guardando..."
                : editingTransaction
                  ? "Guardar cambios"
                  : formMode === "quick"
                    ? "Agregar rapido"
                    : "Agregar movimiento"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Lista</div>
              <p className="mt-1 text-sm text-slate-400">
                Ahora podes cruzar tipos, categorias y grupos sin quedarte limitado a un solo
                filtro por vez.
              </p>
            </div>

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
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            <ChecklistPanel
              label="Tipos"
              helper="Podes marcar mas de uno."
              options={TX_FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                checked: filterTypes.includes(option.value),
              }))}
              onToggle={(value) => setFilterTypes((prev) => toggleValue(prev, value as TxFilterType))}
              onClear={() => setFilterTypes([])}
            />

            <ChecklistPanel
              label="Categorias"
              helper="Sirve para mezclar varios frentes del mismo analisis."
              options={(categoriesQ.data ?? []).map((category) => ({
                value: category.id,
                label: `${category.icon} ${category.name}`,
                checked: filterCategoryIds.includes(category.id),
                tone: category.color,
              }))}
              onToggle={(value) => setFilterCategoryIds((prev) => toggleValue(prev, value))}
              onClear={() => setFilterCategoryIds([])}
            />

            <ChecklistPanel
              label="Grupos"
              helper="Ideal para emprendimientos, clientes o unidades de negocio."
              options={(groupsQ.data ?? []).map((group) => ({
                value: group.id,
                label: group.name,
                checked: filterGroupIds.includes(group.id),
                tone: group.color,
              }))}
              emptyLabel="Todavia no hay grupos cargados."
              onToggle={(value) => setFilterGroupIds((prev) => toggleValue(prev, value))}
              onClear={() => setFilterGroupIds([])}
            />

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Filtro actual</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Resumen rapido de lo que esta entrando en la tabla.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterTypes([]);
                    setFilterCategoryIds([]);
                    setFilterGroupIds([]);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {filterTypes.length === 0 && filterCategoryIds.length === 0 && filterGroupIds.length === 0 ? (
                  <span className="rounded-full border border-slate-800 px-2 py-1 text-xs text-slate-500">
                    Sin filtros extra
                  </span>
                ) : (
                  <>
                    {filterTypes.map((type) => (
                      <FilterChip key={type} label={labelForType(type)} />
                    ))}
                    {filterCategoryIds.map((categoryId) => (
                      <FilterChip
                        key={categoryId}
                        label={catMap[categoryId] ? `${catMap[categoryId].icon} ${catMap[categoryId].name}` : "Categoria"}
                      />
                    ))}
                    {filterGroupIds.map((groupId) => (
                      <FilterChip
                        key={groupId}
                        label={groupMap[groupId]?.name ?? "Grupo"}
                        tone={groupMap[groupId]?.color}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <div className="grid gap-3 border-b border-slate-800 bg-slate-950/70 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Gastos visibles"
              tone="expense"
              primary={fmtMoney(
                getPreferredAmountFromDual(visibleTotals.expense, displayCurrency),
                displayCurrency
              )}
              secondary={fmtMoney(
                getPreferredAmountFromDual(visibleTotals.expense, mirrorCurrency),
                mirrorCurrency
              )}
            />
            <SummaryCard
              label="Ingresos visibles"
              tone="income"
              primary={fmtMoney(
                getPreferredAmountFromDual(visibleTotals.income, displayCurrency),
                displayCurrency
              )}
              secondary={fmtMoney(
                getPreferredAmountFromDual(visibleTotals.income, mirrorCurrency),
                mirrorCurrency
              )}
            />
            <SummaryCard
              label="Neto visible"
              tone={
                getPreferredAmountFromDual(visibleTotals.net, displayCurrency).startsWith("-")
                  ? "expense"
                  : "income"
              }
              primary={fmtMoney(
                getPreferredAmountFromDual(visibleTotals.net, displayCurrency),
                displayCurrency
              )}
              secondary={fmtMoney(
                getPreferredAmountFromDual(visibleTotals.net, mirrorCurrency),
                mirrorCurrency
              )}
            />
            <SummaryCard
              label="Movimientos"
              primary={String(visibleTotals.count)}
              secondary={`vista en ${displayCurrency}`}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-950 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Descripcion</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Grupos</th>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2 text-right">Monto ({displayCurrency})</th>
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
                  const displayAmount = getPreferredAmountFromDual(
                    { ars: transaction.amountArs, usd: transaction.amountUsd },
                    displayCurrency
                  );

                  return (
                    <tr
                      key={transaction.id}
                      className="border-t border-slate-800 hover:bg-slate-900/60"
                    >
                      <td className="px-3 py-2 text-slate-400">
                        {fmtDate(transaction.transactionDate)}
                      </td>
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
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {transaction.groupIds.length === 0 ? (
                            <span className="text-slate-500">-</span>
                          ) : (
                            transaction.groupIds.map((groupId) => (
                              <GroupPill
                                key={groupId}
                                label={groupMap[groupId]?.name ?? "Grupo"}
                                color={groupMap[groupId]?.color}
                              />
                            ))
                          )}
                        </div>
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
                        {fmtMoney(displayAmount, displayCurrency)}
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
                            onClick={() => editTransaction(transaction)}
                            className="text-xs text-slate-300 hover:text-white"
                          >
                            Editar
                          </button>
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
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      No hay movimientos para este filtro.
                    </td>
                  </tr>
                )}

                {txQ.isLoading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      Cargando movimientos...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

function ChecklistPanel({
  label,
  helper,
  options,
  onToggle,
  onClear,
  emptyLabel = "No hay opciones disponibles.",
}: {
  label: string;
  helper: string;
  options: Array<{ value: string; label: string; checked: boolean; tone?: string }>;
  onToggle: (value: string) => void;
  onClear: () => void;
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Limpiar
        </button>
      </div>
      <ChecklistGrid options={options} onToggle={onToggle} emptyLabel={emptyLabel} compact />
    </div>
  );
}

function ChecklistGrid({
  options,
  onToggle,
  emptyLabel,
  compact = false,
}: {
  options: Array<{ value: string; label: string; checked: boolean; tone?: string }>;
  onToggle: (value: string) => void;
  emptyLabel: string;
  compact?: boolean;
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className={
        "grid gap-2 " +
        (compact ? "max-h-52 overflow-auto pr-1" : "sm:grid-cols-2 xl:grid-cols-3")
      }
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={
            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition " +
            (option.checked
              ? "border-brand-500 bg-brand-950/30 text-brand-100"
              : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700")
          }
        >
          <input
            type="checkbox"
            checked={option.checked}
            onChange={() => onToggle(option.value)}
            className="h-4 w-4 accent-brand-500"
          />
          {option.tone && (
            <span
              className="h-2.5 w-2.5 rounded-full border border-white/10"
              style={{ backgroundColor: option.tone }}
            />
          )}
          <span className="min-w-0 truncate">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function GroupPill({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-200">
      <span
        className="h-2 w-2 rounded-full border border-white/10"
        style={{ backgroundColor: color ?? "#14b8a6" }}
      />
      {label}
    </span>
  );
}

function FilterChip({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-200">
      {tone ? (
        <span
          className="h-2 w-2 rounded-full border border-white/10"
          style={{ backgroundColor: tone }}
        />
      ) : null}
      {label}
    </span>
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
  filterTypes: TxFilterType[],
  categoryIds: string[],
  groupIds: string[]
) {
  const params: {
    types?: TxFilterType[];
    categoryIds?: string[];
    groupIds?: string[];
    from?: string;
    to?: string;
    limit?: number;
  } = {};

  if (filterTypes.length) {
    params.types = filterTypes;
  }

  if (categoryIds.length) {
    params.categoryIds = categoryIds;
  }

  if (groupIds.length) {
    params.groupIds = groupIds;
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
      groupIds: Array.isArray(parsed.groupIds)
        ? parsed.groupIds.filter((groupId): groupId is string => typeof groupId === "string")
        : [],
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

function toggleValue<T extends string>(values: T[], nextValue: T) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

function labelForType(type: TxFilterType) {
  return TX_FILTER_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function dedupeIds(ids: string[]) {
  return [...new Set(ids)];
}

function focusForm(setFocus: UseFormSetFocus<FormIn>) {
  if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  setTimeout(() => setFocus("amount"), 0);
}

function getErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  const message = response?.data?.message ?? response?.data?.error;
  if (typeof message === "string" && message.trim()) {
    return message.replaceAll("_", " ");
  }
  return fallback;
}
