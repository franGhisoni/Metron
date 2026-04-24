import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { useCurrencyStore } from "../lib/currency";

const NAV = [
  { to: "/", label: "Panel" },
  { to: "/reports", label: "Reportes" },
  { to: "/transactions", label: "Movimientos" },
  { to: "/accounts", label: "Cuentas" },
  { to: "/settings", label: "Ajustes" },
];

export const Layout = () => {
  const { user, logout } = useAuth();
  const { displayCurrency, setDisplayCurrency } = useCurrencyStore();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold tracking-tight text-brand-500">Metron</span>
            <nav className="hidden gap-4 sm:flex">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    clsx(
                      "text-sm transition-colors",
                      isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 sm:inline-flex">
              <CurrencyToggle
                active={displayCurrency === "ARS"}
                label="ARS"
                onClick={() => setDisplayCurrency("ARS")}
              />
              <CurrencyToggle
                active={displayCurrency === "USD"}
                label="USD"
                onClick={() => setDisplayCurrency("USD")}
              />
            </div>
            <span className="hidden text-slate-500 sm:inline">{user?.email}</span>
            <button
              onClick={() => void logout()}
              className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              Salir
            </button>
          </div>
        </div>
        <div className="border-t border-slate-800 px-2 py-2 sm:hidden">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <CurrencyToggle
              active={displayCurrency === "ARS"}
              label="ARS"
              onClick={() => setDisplayCurrency("ARS")}
            />
            <CurrencyToggle
              active={displayCurrency === "USD"}
              label="USD"
              onClick={() => setDisplayCurrency("USD")}
            />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-800 px-2 py-1 sm:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "rounded-md px-3 py-1.5 text-xs",
                  isActive ? "bg-slate-800 text-white" : "text-slate-400"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};

const CurrencyToggle = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "rounded-md px-2.5 py-1 text-xs transition",
      active ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800"
    )}
  >
    {label}
  </button>
);
