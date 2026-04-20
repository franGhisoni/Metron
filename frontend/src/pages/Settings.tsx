import { useAuth } from "../lib/auth";

// TODO: Phase 1b — wire /api/users/me PATCH endpoint + form to edit
// currencyPref, fiftyThirtyTwenty, liquidityAlertThreshold, phone.
export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
        <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">Perfil</div>
        <div className="grid gap-2">
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Teléfono" value={user?.phone ?? "(sin teléfono)"} />
          <Row label="Moneda preferida" value={user?.currencyPref ?? "ARS"} />
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Edición de perfil disponible próximamente. (Fase 1b)
        </p>
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between border-b border-slate-800 py-1.5 last:border-b-0">
    <span className="text-slate-400">{label}</span>
    <span className="text-slate-100">{value}</span>
  </div>
);
