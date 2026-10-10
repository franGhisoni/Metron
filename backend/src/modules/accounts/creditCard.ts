import { addDaysUTC, clampClosingDay, startOfUtcDay } from "../../lib/dates.js";

type DueRule = {
  dueDay: number | null;
  dueMonthOffset: number | null;
  dueDaysAfterClosing: number | null;
};

export type CreditCardStatus = {
  closingDay: number;
  dueDay: number | null;
  dueMonthOffset: number | null;
  dueDaysAfterClosing: number | null;
  previousCloseDate: string;
  previousDueDate: string;
  currentCloseDate: string;
  currentDueDate: string;
  nextCloseDate: string;
  nextDueDate: string;
};

const dateInMonth = (year: number, monthIndex: number, day: number): Date => {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  return new Date(Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    clampClosingDay(first.getUTCFullYear(), first.getUTCMonth(), day)
  ));
};

const cycle = (year: number, monthIndex: number, closingDay: number, rule: DueRule) => {
  const close = dateInMonth(year, monthIndex, closingDay);
  const due = rule.dueDay !== null && rule.dueMonthOffset !== null
    ? dateInMonth(year, monthIndex + rule.dueMonthOffset, rule.dueDay)
    : addDaysUTC(close, rule.dueDaysAfterClosing ?? 0);
  return { close, due };
};

// The next payment due controls which statement is shown. A statement stays
// current after closing, until its due date; new purchases then belong to next.
export const computeCreditCardStatus = (
  closingDay: number,
  rule: DueRule,
  today: Date = new Date()
): CreditCardStatus => {
  const t = startOfUtcDay(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const candidates = Array.from({ length: 7 }, (_, index) =>
    cycle(y, m + index - 3, closingDay, rule)
  );
  const currentIndex = candidates.findIndex((item) => item.due >= t);
  if (currentIndex < 1 || currentIndex >= candidates.length - 1) {
    throw new Error("invalid_card_due_rule");
  }
  const previous = candidates[currentIndex - 1]!;
  const current = candidates[currentIndex]!;
  const next = candidates[currentIndex + 1]!;

  return {
    closingDay,
    ...rule,
    previousCloseDate: previous.close.toISOString(),
    previousDueDate: previous.due.toISOString(),
    currentCloseDate: current.close.toISOString(),
    currentDueDate: current.due.toISOString(),
    nextCloseDate: next.close.toISOString(),
    nextDueDate: next.due.toISOString(),
  };
};

export const assignStatement = (
  txDate: Date,
  status: CreditCardStatus,
  isPayment = false
): "current" | "next" | null => {
  const tx = startOfUtcDay(txDate).getTime();
  const previous = new Date(isPayment ? status.previousDueDate : status.previousCloseDate).getTime();
  const current = new Date(isPayment ? status.currentDueDate : status.currentCloseDate).getTime();
  const next = new Date(isPayment ? status.nextDueDate : status.nextCloseDate).getTime();
  if (tx > previous && tx <= current) return "current";
  if (tx > current && tx <= next) return "next";
  return null;
};
