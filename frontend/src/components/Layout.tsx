import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Panel" },
  { to: "/transactions", label: "Movimientos" },
  { to: "/accounts", label: "Cuentas" },
  { to: "/settings", label: "Ajustes" },
];

export const Layout = () => {
  const { user, logout } = useAuth();
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
            <span className="hidden text-slate-500 sm:inline">{user?.email}</span>
            <button
              onClick={() => void logout()}
              className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              Salir
            </button>
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
