import { useState } from "react";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../hooks/queries";
import type { Category } from "../lib/types";

type Draft = {
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
};

type DraftErrors = Partial<Record<keyof Draft, string>>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const emptyDraft: Draft = { name: "", type: "expense", color: "#64748b", icon: "📌" };
const emptyErrors: DraftErrors = {};

export default function CategoriesManager() {
  const catsQ = useCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [editErrors, setEditErrors] = useState<DraftErrors>(emptyErrors);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [newErrors, setNewErrors] = useState<DraftErrors>(emptyErrors);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cats = catsQ.data ?? [];
  const income = cats.filter((c) => c.type === "income");
  const expense = cats.filter((c) => c.type === "expense");
  const actionsDisabled = createCat.isPending || updateCat.isPending;

  const openAdd = () => {
    setFeedback(null);
    setAdding(true);
    setNewDraft(emptyDraft);
    setNewErrors(emptyErrors);
  };

  const closeAdd = () => {
    setAdding(false);
    setNewDraft(emptyDraft);
    setNewErrors(emptyErrors);
  };

  const startEdit = (category: Category) => {
    setFeedback(null);
    setEditingCategory(category);
    setEditDraft({
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
    });
    setEditErrors(emptyErrors);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setEditDraft(emptyDraft);
    setEditErrors(emptyErrors);
  };

  const saveEdit = async () => {
    if (!editingCategory) return;
    const errors = validateDraft(editDraft);
    if (hasErrors(errors)) {
      setEditErrors(errors);
      return;
    }

    try {
      setFeedback(null);
      await updateCat.mutateAsync({
        id: editingCategory.id,
        ...toPayload(editDraft),
      });
      cancelEdit();
    } catch (error) {
      setFeedback(getErrorMessage(error, "No pudimos guardar los cambios de la categoría."));
    }
  };

  const saveNew = async () => {
    const errors = validateDraft(newDraft);
    if (hasErrors(errors)) {
      setNewErrors(errors);
      return;
    }

    try {
      setFeedback(null);
      await createCat.mutateAsync(toPayload(newDraft));
      closeAdd();
    } catch (error) {
      setFeedback(getErrorMessage(error, "No pudimos crear la categoría."));
    }
  };

  const remove = async (category: Category) => {
    const confirmed = confirm(
      `¿Eliminar "${category.name}"? Las transacciones asociadas quedarán sin categoría.`
    );
    if (!confirmed) return;

    try {
      setFeedback(null);
      setDeletingId(category.id);
      await deleteCat.mutateAsync(category.id);
      if (editingCategory?.id === category.id) cancelEdit();
    } catch (error) {
      setFeedback(getErrorMessage(error, "No pudimos eliminar la categoría."));
    } finally {
      setDeletingId(null);
    }
  };

  if (catsQ.isLoading && cats.length === 0) {
    return (
      <CardShell>
        <Header
          count={0}
          onAdd={openAdd}
          adding={adding}
          subtitle="Cargando categorías..."
          canAdd={false}
        />
      </CardShell>
    );
  }

  if (catsQ.isError && cats.length === 0) {
    return (
      <CardShell>
        <Header
          count={0}
          onAdd={openAdd}
          adding={adding}
          subtitle="No pudimos cargar tus categorías. Probá refrescando la página."
          canAdd={false}
        />
      </CardShell>
    );
  }

  return (
    <>
      <CardShell>
        <Header
          count={cats.length}
          onAdd={adding ? closeAdd : openAdd}
          adding={adding}
          subtitle="Editá nombre, tipo, emoji y color sin salir de Ajustes."
        />

        {feedback && (
          <div className="mb-4 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {feedback}
          </div>
        )}

        {adding && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-100">Nueva categoría</div>
                <p className="mt-1 text-xs text-slate-400">
                  Elegí un nombre claro para que aparezca prolijo en tus reportes y transacciones.
                </p>
              </div>
              <button
                onClick={closeAdd}
                className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-600"
              >
                Cancelar
              </button>
            </div>

            <DraftForm
              draft={newDraft}
              errors={newErrors}
              setField={(field, value) =>
                updateDraftField(setNewDraft, setNewErrors, field, value)
              }
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeAdd}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => void saveNew()}
                disabled={createCat.isPending}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {createCat.isPending ? "Creando..." : "Crear categoría"}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <Section
            title="Ingresos"
            description="Entradas de dinero como sueldo, ventas o reintegros."
            cats={income}
            onEdit={startEdit}
            onDelete={remove}
            deletingId={deletingId}
            disabled={actionsDisabled}
          />
          <Section
            title="Gastos"
            description="Compras, servicios, salidas y cualquier egreso."
            cats={expense}
            onEdit={startEdit}
            onDelete={remove}
            deletingId={deletingId}
            disabled={actionsDisabled}
          />
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Si eliminás una categoría, las transacciones no se borran: quedan como no categorizadas.
        </p>
      </CardShell>

      {editingCategory && (
        <ModalShell title={`Editar ${editingCategory.name}`} onClose={cancelEdit}>
          <DraftForm
            draft={editDraft}
            errors={editErrors}
            setField={(field, value) =>
              updateDraftField(setEditDraft, setEditErrors, field, value)
            }
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={cancelEdit}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveEdit()}
              disabled={updateCat.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {updateCat.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

function Header({
  count,
  onAdd,
  adding,
  subtitle,
  canAdd = true,
}: {
  count: number;
  onAdd: () => void;
  adding: boolean;
  subtitle: string;
  canAdd?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-slate-400">Categorías</div>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
            {count}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      <button
        onClick={onAdd}
        disabled={!canAdd}
        className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-brand-500 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {adding ? "Cerrar formulario" : "+ Nueva categoría"}
      </button>
    </div>
  );
}

function Section({
  title,
  description,
  cats,
  onEdit,
  onDelete,
  deletingId,
  disabled,
}: {
  title: string;
  description: string;
  cats: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  deletingId: string | null;
  disabled: boolean;
}) {
  return (
    <section>
      <div className="mb-2">
        <div className="text-sm font-medium text-slate-100">{title}</div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        {cats.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">Todavía no tenés categorías acá.</div>
        )}

        {cats.map((category) => {
          const isDeleting = deletingId === category.id;
          return (
            <div
              key={category.id}
              className="grid gap-3 border-b border-slate-800 bg-slate-950/40 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{category.icon}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {category.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-white/10"
                        style={{ backgroundColor: category.color }}
                      />
                      <span>{category.color.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center sm:justify-center">
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                  {category.type === "income" ? "Ingreso" : "Gasto"}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:justify-end">
                <button
                  onClick={() => onEdit(category)}
                  disabled={disabled || isDeleting}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-300 disabled:opacity-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => void onDelete(category)}
                  disabled={disabled || isDeleting}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-500 hover:text-rose-300 disabled:opacity-50"
                >
                  {isDeleting ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DraftForm({
  draft,
  errors,
  setField,
}: {
  draft: Draft;
  errors: DraftErrors;
  setField: <K extends keyof Draft>(field: K, value: Draft[K]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Field label="Nombre" error={errors.name}>
        <input
          value={draft.name}
          onChange={(e) => setField("name", e.target.value)}
          className={inputCls}
          placeholder="Supermercado"
        />
      </Field>

      <Field label="Tipo" error={errors.type}>
        <select
          value={draft.type}
          onChange={(e) => setField("type", e.target.value as Draft["type"])}
          className={inputCls}
        >
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </select>
      </Field>

      <Field label="Emoji" error={errors.icon}>
        <input
          value={draft.icon}
          onChange={(e) => setField("icon", e.target.value)}
          maxLength={8}
          className={inputCls}
          placeholder="🛒"
        />
      </Field>

      <Field label="Color" error={errors.color}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setField("color", e.target.value)}
            className="h-10 w-12 cursor-pointer rounded border border-slate-700 bg-slate-950"
          />
          <input
            value={draft.color}
            onChange={(e) => setField("color", e.target.value)}
            className={inputCls}
            placeholder="#ef4444"
          />
        </div>
      </Field>
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-100">{title}</div>
            <p className="mt-1 text-sm text-slate-400">
              Los cambios impactan en cómo se muestran las transacciones futuras y pasadas.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">{children}</div>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </label>
  );
}

function updateDraftField<K extends keyof Draft>(
  setDraft: React.Dispatch<React.SetStateAction<Draft>>,
  setErrors: React.Dispatch<React.SetStateAction<DraftErrors>>,
  field: K,
  value: Draft[K]
) {
  setDraft((prev) => ({ ...prev, [field]: value }));
  setErrors((prev) => ({ ...prev, [field]: undefined }));
}

function validateDraft(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};

  if (!draft.name.trim()) {
    errors.name = "Ingresá un nombre.";
  } else if (draft.name.trim().length > 40) {
    errors.name = "Usá hasta 40 caracteres.";
  }

  if (!draft.icon.trim()) {
    errors.icon = "Elegí un emoji.";
  } else if (draft.icon.trim().length > 8) {
    errors.icon = "Usá un emoji corto.";
  }

  if (!HEX.test(draft.color)) {
    errors.color = "Usá formato #RRGGBB.";
  }

  if (draft.type !== "income" && draft.type !== "expense") {
    errors.type = "Seleccioná un tipo válido.";
  }

  return errors;
}

function hasErrors(errors: DraftErrors) {
  return Object.values(errors).some(Boolean);
}

function toPayload(draft: Draft): Draft {
  return {
    name: draft.name.trim(),
    type: draft.type,
    color: draft.color,
    icon: draft.icon.trim(),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  const message = response?.data?.message ?? response?.data?.error;
  if (typeof message === "string" && message.trim()) {
    return message.replaceAll("_", " ");
  }
  return fallback;
}

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500";
