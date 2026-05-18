import { useEffect, useState, type FormEvent } from "react";
import CategoriesManager from "../components/CategoriesManager";
import GroupsManager from "../components/GroupsManager";
import { useCurrencyStore } from "../lib/currency";
import { useAuth, type User } from "../lib/auth";

type ProfileForm = {
  phone: string;
  currencyPref: "ARS" | "USD";
  fiftyThirtyTwenty: boolean;
  liquidityAlertThreshold: string;
};

const formFromUser = (user: User | null): ProfileForm => ({
  phone: user?.phone ?? "",
  currencyPref: user?.currencyPref ?? "ARS",
  fiftyThirtyTwenty: user?.fiftyThirtyTwenty ?? false,
  liquidityAlertThreshold: user?.liquidityAlertThreshold ?? "",
});

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { setDisplayCurrency } = useCurrencyStore();
  const [form, setForm] = useState<ProfileForm>(() => formFromUser(user));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(formFromUser(user));
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const updated = await updateProfile({
        phone: form.phone.trim() || null,
        currencyPref: form.currencyPref,
        fiftyThirtyTwenty: form.fiftyThirtyTwenty,
        liquidityAlertThreshold: form.liquidityAlertThreshold.trim() || null,
      });
      setDisplayCurrency(updated.currencyPref);
      setMessage("Ajustes guardados.");
    } catch {
      setError("No pude guardar los ajustes. Revisá los valores e intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ajustes</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configura tu perfil y manten ordenadas las categorias y grupos que usas para registrar
          movimientos.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Perfil</div>
            <div className="mt-1 text-sm text-slate-100">{user?.email ?? "-"}</div>
          </div>
          <button
            type="submit"
            disabled={saving || !user}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-300">
            Telefono
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              className={inputCls}
              placeholder="+549..."
              autoComplete="tel"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-300">
            Moneda preferida
            <select
              value={form.currencyPref}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currencyPref: event.target.value as "ARS" | "USD",
                }))
              }
              className={inputCls}
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm text-slate-300">
            Alerta de liquidez
            <input
              value={form.liquidityAlertThreshold}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  liquidityAlertThreshold: event.target.value,
                }))
              }
              className={inputCls}
              inputMode="decimal"
              placeholder="0"
            />
            <span className="text-xs text-slate-500">
              Umbral en ARS para alertar cuando el saldo proyectado quede por debajo.
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.fiftyThirtyTwenty}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  fiftyThirtyTwenty: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-brand-500"
            />
            <span>Activar tracker 50/30/20</span>
          </label>
        </div>

        {message ? <div className="mt-4 text-sm text-emerald-400">{message}</div> : null}
        {error ? <div className="mt-4 text-sm text-rose-400">{error}</div> : null}
      </form>

      <CategoriesManager />
      <GroupsManager />
    </div>
  );
}

const inputCls =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-brand-500";
