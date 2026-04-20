import Decimal from "decimal.js";

export const fmtMoney = (amount: string | number | Decimal, currency: "ARS" | "USD"): string => {
  const d = new Decimal(amount.toString());
  const n = d.toNumber();
  return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
};

export const fmtPct = (v: number | null): string =>
  v === null ? "—" : new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(v);

export const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(iso));
