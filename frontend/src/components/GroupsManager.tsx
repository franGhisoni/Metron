import { useState } from "react";
import {
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useUpdateGroup,
} from "../hooks/queries";
import type { TransactionGroup } from "../lib/types";

type Draft = {
  name: string;
  color: string;
};

type DraftErrors = Partial<Record<keyof Draft, string>>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const emptyDraft: Draft = { name: "", color: "#14b8a6" };
const emptyErrors: DraftErrors = {};

export default function GroupsManager() {
  const groupsQ = useGroups();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();

  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [newErrors, setNewErrors] = useState<DraftErrors>(emptyErrors);
  const [editingGroup, setEditingGroup] = useState<TransactionGroup | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [editErrors, setEditErrors] = useState<DraftErrors>(emptyErrors);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groups = groupsQ.data ?? [];
  const busy = createGroup.isPending || updateGroup.isPending;

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

  const startEdit = (group: TransactionGroup) => {
    setFeedback(null);
    setEditingGroup(group);
    setEditDraft({
      name: group.name,
      color: group.color,
    });
    setEditErrors(emptyErrors);
  };

  const cancelEdit = () => {
    setEditingGroup(null);
    setEditDraft(emptyDraft);
    setEditErrors(emptyErrors);
  };

  const saveNew = async () => {
    const errors = validateDraft(newDraft);
    if (hasErrors(errors)) {
      setNewErrors(errors);
      return;
    }

    try {
      setFeedback(null);
      await createGroup.mutateAsync(toPayload(newDraft));
      closeAdd();
    } catch (error) {
      setFeedback(getErrorMessage(error, "No pudimos crear el grupo."));
    }
  };

  const saveEdit = async () => {
    if (!editingGroup) return;
    const errors = validateDraft(editDraft);
    if (hasErrors(errors)) {
      setEditErrors(errors);
      return;
    }

    try {
      setFeedback(null);
      await updateGroup.mutateAsync({
        id: editingGroup.id,
        ...toPayload(editDraft),
      });
      cancelEdit();
    } catch (error) {
      setFeedback(getErrorMessage(error, "No pudimos guardar el grupo."));
    }
  };

  const remove = async (group: TransactionGroup) => {
    const confirmed = confirm(
      `Eliminar "${group.name}"? Los movimientos quedan igual, solo pierden esta asociacion.`
    );
    if (!confirmed) return;

    try {
      setFeedback(null);
      setDeletingId(group.id);
      await deleteGroup.mutateAsync(group.id);
      if (editingGroup?.id === group.id) cancelEdit();
    } catch (error) {
      setFeedback(getErrorMessage(error, "No pudimos eliminar el grupo."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <CardShell>
        <Header
          count={groups.length}
          adding={adding}
          onAdd={adding ? closeAdd : openAdd}
          subtitle="Agrupa movimientos de distintos tipos bajo un mismo proyecto, cliente o unidad de negocio."
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
                <div className="text-sm font-medium text-slate-100">Nuevo grupo</div>
                <p className="mt-1 text-xs text-slate-400">
                  Pensa en frentes que crucen ingresos y gastos: "Tienda", "Cliente ACME" o "Local 2".
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
                disabled={createGroup.isPending}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
              >
                {createGroup.isPending ? "Creando..." : "Crear grupo"}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-800">
          {groupsQ.isLoading && groups.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">Cargando grupos...</div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">
              Todavia no tenes grupos. Cuando los crees, vas a poder asociarlos a varios movimientos.
            </div>
          ) : (
            groups.map((group) => {
              const isDeleting = deletingId === group.id;
              return (
                <div
                  key={group.id}
                  className="grid gap-3 border-b border-slate-800 bg-slate-950/40 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-white/10"
                        style={{ backgroundColor: group.color }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-100">
                          {group.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{group.color.toUpperCase()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <button
                      onClick={() => startEdit(group)}
                      disabled={busy || isDeleting}
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-300 disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void remove(group)}
                      disabled={busy || isDeleting}
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-500 hover:text-rose-300 disabled:opacity-50"
                    >
                      {isDeleting ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardShell>

      {editingGroup && (
        <ModalShell title={`Editar ${editingGroup.name}`} onClose={cancelEdit}>
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
              disabled={updateGroup.isPending}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {updateGroup.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

function Header({
  count,
  adding,
  onAdd,
  subtitle,
}: {
  count: number;
  adding: boolean;
  onAdd: () => void;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-slate-400">Grupos</div>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
            {count}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      <button
        onClick={onAdd}
        className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-brand-500 hover:text-brand-300"
      >
        {adding ? "Cerrar formulario" : "+ Nuevo grupo"}
      </button>
    </div>
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
          onChange={(event) => setField("name", event.target.value)}
          className={inputCls}
          placeholder="Cliente ACME"
        />
      </Field>

      <Field label="Color" error={errors.color}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(event) => setField("color", event.target.value)}
            className="h-10 w-12 cursor-pointer rounded border border-slate-700 bg-slate-950"
          />
          <input
            value={draft.color}
            onChange={(event) => setField("color", event.target.value)}
            className={inputCls}
            placeholder="#14b8a6"
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
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-100">{title}</div>
            <p className="mt-1 text-sm text-slate-400">
              Los cambios se reflejan en los filtros y en los movimientos ya asociados.
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
    errors.name = "Ingresa un nombre.";
  } else if (draft.name.trim().length > 40) {
    errors.name = "Usa hasta 40 caracteres.";
  }

  if (!HEX.test(draft.color)) {
    errors.color = "Usa formato #RRGGBB.";
  }

  return errors;
}

function hasErrors(errors: DraftErrors) {
  return Object.values(errors).some(Boolean);
}

function toPayload(draft: Draft): Draft {
  return {
    name: draft.name.trim(),
    color: draft.color,
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
