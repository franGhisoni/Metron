import { addDaysUTC, clampClosingDay, startOfUtcDay } from "../../lib/dates.js";

// Rule (per spec):
//   - closingDay is the day of the month when the statement closes (1–31).
//   - dueDaysAfterClosing is the number of days after closing when payment is due.
//   - A purchase made ON or BEFORE the current month's closing day falls into the
//     CURRENT statement (due shortly).
//   - A purchase made AFTER the closing day falls into the NEXT statement
//     (impacts next month's cash flow).
//
// The "current statement close" is always the NEXT closing date from `today` (or today
// itself if today IS the closing day). "Previous close" is the prior one.
// `assignStatement(txDate, today, closingDay)` returns "current" if the tx belongs
// to the statement currently being accumulated (i.e. between prevClose+1 and currentClose,
// inclusive of currentClose), else "next".

export type CreditCardStatus = {
  closingDay: number;
  dueDaysAfterClosing: number;
  previousCloseDate: string;
  currentCloseDate: string;
  currentDueDate: string;
  nextCloseDate: string;
  nextDueDate: string;
};

const closingDateInMonth = (year: number, monthIndex: number, closingDay: number): Date => {
  const day = clampClosingDay(year, monthIndex, closingDay);
  return new Date(Date.UTC(year, monthIndex, day));
};

export const computeCreditCardStatus = (
  closingDay: number,
  dueDaysAfterClosing: number,
  today: Date = new Date()
): CreditCardStatus => {
  const t = startOfUtcDay(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();

  const thisMonthClose = closingDateInMonth(y, m, closingDay);

  let currentClose: Date;
  let previousClose: Date;
  let nextClose: Date;

  if (t.getTime() <= thisMonthClose.getTime()) {
    // Still in the current statement cycle ending this month.
    currentClose = thisMonthClose;
    previousClose = closingDateInMonth(y, m - 1, closingDay);
    nextClose = closingDateInMonth(y, m + 1, closingDay);
  } else {
    // Past this month's close — current statement closes next month.
    currentClose = closingDateInMonth(y, m + 1, closingDay);
    previousClose = thisMonthClose;
    nextClose = closingDateInMonth(y, m + 2, closingDay);
  }

  return {
    closingDay,
    dueDaysAfterClosing,
    previousCloseDate: previousClose.toISOString(),
    currentCloseDate: currentClose.toISOString(),
    currentDueDate: addDaysUTC(currentClose, dueDaysAfterClosing).toISOString(),
    nextCloseDate: nextClose.toISOString(),
    nextDueDate: addDaysUTC(nextClose, dueDaysAfterClosing).toISOString(),
  };
};

// For a given purchase date, determine whether it falls in the CURRENT or NEXT statement.
export const assignStatement = (
  txDate: Date,
  today: Date,
  closingDay: number
): "current" | "next" => {
  const status = computeCreditCardStatus(closingDay, 0, today);
  const currentClose = new Date(status.currentCloseDate);
  const previousClose = new Date(status.previousCloseDate);
  const tx = startOfUtcDay(txDate);
  if (tx.getTime() > previousClose.getTime() && tx.getTime() <= currentClose.getTime()) {
    return "current";
  }
  return "next";
};
