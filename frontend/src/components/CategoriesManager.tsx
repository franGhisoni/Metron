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

const HEX = /^#[0-9a-fA-F]{6}$/;

const emptyDraft: Draft = { name: "", type: "expense", color: "#64748b", icon: "📌" };

export default function CategoriesManager() {
  const catsQ = useCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditDraft({
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    if (!editDraft.name.trim()) return;
    if (!HEX.test(editDraft.color)) return;
    await updateCat.mutateAsync({ id: editingId, ...editDraft });
    cancelEdit();
  };
  const saveNew = async () => {
    if (!newDraft.name.trim() || !HEX.test(newDraft.color) || !newDraft.icon) return;
    await createCat.mutateAsync(newDraft);
    setNewDraft(emptyDraft);
    setAdding(false);
  };
  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta categoría? Las transacciones quedarán sin categoría.")) return;
    await deleteCat.mutateAsync(id);
  };

  const cats = catsQ.data ?? [];
  const income = cats.filter((c) => c.type === "income");
  const expense = cats.filter((c) => c.type === "expense");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-400">Categorías</div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-brand-500 hover:text-brand-300"
        >
          {adding ? "Cancelar" : "+ Nueva"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-md border border-slate-700 bg-slate-950 p-3">
          <DraftForm draft={newDraft} setDraft={setNewDraft} />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setNewDraft(emptyDraft);
              }}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveNew()}
              disabled={createCat.isPending}
              className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {createCat.isPending ? "Guardando…" : "Crear"}
            </button>
          </div>
        </div>
      )}

      <Section
        title="Ingresos"
        cats={income}
        editingId={editingId}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        startEdit={startEdit}
        cancelEdit={cancelEdit}
        saveEdit={saveEdit}
        remove={remove}
        saving={updateCat.isPending}
      />
      <Section
        title="Gastos"
        cats={expense}
        editingId={editingId}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        startEdit={startEdit}
        cancelEdit={cancelEdit}
        saveEdit={saveEdit}
        remove={remove}
        saving={updateCat.isPending}
      />
    </div>
  );
}

function Section(props: {
  title: string;
  cats: Category[];
  editingId: string | null;
  editDraft: Draft;
  setEditDraft: (d: Draft) => void;
  startEdit: (c: Category) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  remove: (id: string) => void;
  saving: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-xs font-medium text-slate-300">{props.title}</div>
      <div className="divide-y divide-slate-800 rounded-md border border-slate-800">
        {props.cats.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-500">Sin categorías.</div>
        )}
        {props.cats.map((c) =>
          props.editingId === c.id ? (
            <div key={c.id} className="bg-slate-950 p-3">
              <DraftForm draft={props.editDraft} setDraft={props.setEditDraft} />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={props.cancelEdit}
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs"
                >
                  Cancelar
                </button>
                <button
                  onClick={props.saveEdit}
                  disabled={props.saving}
                  className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {props.saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-base">{c.icon}</span>
              <span className="flex-1 text-slate-100">{c.name}</span>
              <button
                onClick={() => props.startEdit(c)}
                className="text-xs text-slate-400 hover:text-brand-300"
              >
                Editar
              </button>
              <button
                onClick={() => props.remove(c.id)}
                className="text-xs text-slate-500 hover:text-rose-400"
              >
                Eliminar
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function DraftForm({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">Nombre</span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={inputCls}
          placeholder="Supermercado"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">Tipo</span>
        <select
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as "income" | "expense" })}
          className={inputCls}
        >
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">Ícono</span>
        <input
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          maxLength={8}
          className={inputCls}
          placeholder="🛒"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">Color</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="h-9 w-10 cursor-pointer rounded border border-slate-700 bg-slate-950"
          />
          <input
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className={inputCls}
            placeholder="#ef4444"
          />
        </div>
      </label>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500";
