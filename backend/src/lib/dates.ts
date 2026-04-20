// Credit-card helpers. All dates are operated on in UTC to avoid TZ drift; the
// business rule is "calendar-day comparison", so we always use getUTC* and
// construct via Date.UTC.

export const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const daysInMonthUTC = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

// Clamp a closing day (1-31) to the actual length of the target month.
// Example: closingDay 31 in February → 28 or 29.
export const clampClosingDay = (year: number, monthIndex: number, closingDay: number): number =>
  Math.min(closingDay, daysInMonthUTC(year, monthIndex));

export const addDaysUTC = (d: Date, days: number): Date => {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
};
