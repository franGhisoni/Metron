import { zodResolver } from "@hookform/resolvers/zod";
import Decimal from "decimal.js";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from "../hooks/queries";
import { fmtDate, fmtMoney } from "../lib/money";
import type { GoalStatus, SavingsGoal } from "../lib/types";

const STATUSES: Array<{ value: GoalStatus; label: string }> = [
  { value: "active", label: "Activa" },
  { value: "wishlist", label: "Wishlist" },
  { value: "paused", label: "Pausada" },
  { value: "completed", label: "Completada" },
];

const GoalSchema = z.object({
  name: z.string().trim().min(1, "requerido").max(100),
  targetAmount: z.string().regex(/^\d+(\.\d+)?$/, "invalido"),
  currency: z.enum(["ARS", "USD"]),
  targetDate: z.string().optional(),
  currentAmount: z.string().regex(/^\d+(\.\d+)?$/, "invalido").default("0"),
  status: z.enum(["wishlist", "active", "completed", "paused"]),
});
type GoalForm = z.infer<typeof GoalSchema>;

const defaultValues: GoalForm = {
  name: "",
  targetAmount: "",
  currency: "ARS",
  targetDate: "",
  currentAmount: "0",
  status: "active",
};

export default function GoalsPage() {
  const goalsQ = useGoals();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GoalForm>({
    resolver: zodResolver(GoalSchema),
    defaultValues,
  });

  const openCreate = () => {
    setEditing(null);
    reset(defaultValues);
    setShowForm(true);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal);
    reset({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currency: goal.currency,
      targetDate: goal.targetDate ? goal.targetDate.slice(0, 10) : "",
      currentAmount: goal.currentAmount,
      status: goal.status,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    reset(defaultValues);
  };

  const onSubmit = async (data: GoalForm) => {
    const body = {
      name: data.name,
      targetAmount: data.targetAmount,
      currency: data.currency,
      currentAmount: data.currentAmount,
      status: data.status,
      targetDate: data.targetDate ? new Date(`${data.targetDate}T12:00:00Z`).toISOString() : null,
    };

    if (editing) {
      await updateGoal.mutateAsync({ id: editing.id, ...body });
    } else {
      await createGoal.mutateAsync(body);
    }
    closeForm();
  };

  const goals = goalsQ.data ?? [];
  const activeGoals = goals.filter((g) => g.status !== "completed");
  const completedGoals = goals.filter((g) => g.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Metas</h1>
          <p className="mt-1 text-sm text-slate-400">
            Wishlist y objetivos de ahorro con progreso real.
          </p>
        </div>
        <button
          onClick={showForm ? closeForm : openCreate}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {showForm ? "Cancelar" : "+ Nueva meta"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-4"
        >
          <Field label="Nombre" error={errors.name?.message}>
            <input {...register("name")} className={inputCls} placeholder="Fondo de emergencia" />
          </Field>
          <Field label="Objetivo" error={errors.targetAmount?.message}>
            <input {...register("targetAmount")} className={inputCls} placeholder="0.00" />
          </Field>
          <Field label="Moneda">
            <select {...register("currency")} className={inputCls}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </Field>
          <Field label="Ahorrado" error={errors.currentAmount?.message}>
            <input {...register("currentAmount")} className={inputCls} placeholder="0.00" />
          </Field>
          <Field label="Fecha objetivo">
            <input type="date" {...register("targetDate")} className={inputCls} />
          </Field>
          <Field label="Estado">
            <select {...register("status")} className={inputCls}>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={createGoal.isPending || updateGoal.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {createGoal.isPending || updateGoal.isPending
                ? "Guardando..."
                : editing
                  ? "Guardar cambios"
                  : "Crear meta"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancelar edicion
              </button>
            )}
          </div>
        </form>
      )}

      {goalsQ.isLoading && <div className="text-sm text-slate-500">Cargando metas...</div>}

      {!goalsQ.isLoading && goals.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-slate-500">
          Todavia no cargaste metas de ahorro.
        </div>
      )}

      {activeGoals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            En progreso
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={() => openEdit(goal)}
                onDelete={() => void deleteGoal.mutate(goal.id)}
              />
            ))}
          </div>
        </section>
      )}

      {completedGoals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Completadas
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={() => openEdit(goal)}
                onDelete={() => void deleteGoal.mutate(goal.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const GoalCard = ({
  goal,
  onEdit,
  onDelete,
}: {
  goal: SavingsGoal;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const progress = getProgress(goal);
  const monthlyNeed = getMonthlyNeed(goal);
  const remaining = Decimal.max(
    new Decimal(goal.targetAmount).minus(goal.currentAmount),
    new Decimal(0)
  );

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{goal.name}</h3>
            <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
              {statusLabel(goal.status)}
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {fmtMoney(goal.currentAmount, goal.currency)} de{" "}
            {fmtMoney(goal.targetAmount, goal.currency)}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 text-xs">
          <button onClick={onEdit} className="text-slate-400 hover:text-slate-100">
            Editar
          </button>
          <button onClick={onDelete} className="text-slate-500 hover:text-rose-400">
            Eliminar
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>{progress.toFixed(1)}%</span>
          <span>Faltan {fmtMoney(remaining, goal.currency)}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <div className="rounded-md bg-slate-950/60 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Fecha objetivo</div>
          <div className="mt-1">{goal.targetDate ? fmtDate(goal.targetDate) : "Sin fecha"}</div>
        </div>
        <div className="rounded-md bg-slate-950/60 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Ahorro mensual
          </div>
          <div className="mt-1">
            {monthlyNeed ? fmtMoney(monthlyNeed, goal.currency) : "Sin estimacion"}
          </div>
        </div>
      </div>
    </div>
  );
};

const getProgress = (goal: SavingsGoal) => {
  const target = new Decimal(goal.targetAmount);
  if (target.lte(0)) return 0;
  return new Decimal(goal.currentAmount).div(target).mul(100).toNumber();
};

const getMonthlyNeed = (goal: SavingsGoal) => {
  if (!goal.targetDate) return null;
  const remaining = Decimal.max(
    new Decimal(goal.targetAmount).minus(goal.currentAmount),
    new Decimal(0)
  );
  if (remaining.eq(0)) return "0";

  const now = new Date();
  const target = new Date(goal.targetDate);
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return remaining.toString();

  const months = Math.max(days / 30.4375, 1);
  return remaining.div(months).toDecimalPlaces(2, Decimal.ROUND_UP).toString();
};

const statusLabel = (status: GoalStatus) =>
  STATUSES.find((item) => item.value === status)?.label ?? status;

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
