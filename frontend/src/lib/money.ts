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

export const localDateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Date inputs represent calendar days. Store them at UTC noon so displaying
// them does not cross into the previous or following day by timezone.
export const dateInputToIso = (date: string): string =>
  new Date(`${date}T12:00:00.000Z`).toISOString();

export const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

export const fmtTimestampDate = (iso: string): string =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(iso));
