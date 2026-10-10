import assert from "node:assert/strict";
import test from "node:test";
import { computeCreditCardStatus, assignStatement } from "../dist/modules/accounts/creditCard.js";
import { argentinaCalendarDay } from "../dist/lib/dates.js";

const isoDay = (value) => value.slice(0, 10);
const fixed = (dueDay, dueMonthOffset) => ({ dueDay, dueMonthOffset, dueDaysAfterClosing: null });

test("a closed statement stays current until its due date", () => {
  const status = computeCreditCardStatus(25, fixed(10, 1), new Date("2026-10-26T12:00:00Z"));
  assert.equal(isoDay(status.currentCloseDate), "2026-10-25");
  assert.equal(isoDay(status.currentDueDate), "2026-11-10");
  assert.equal(isoDay(status.nextCloseDate), "2026-11-25");
  assert.equal(isoDay(status.nextDueDate), "2026-12-10");
  assert.equal(assignStatement(new Date("2026-10-24T12:00:00Z"), status), "current");
  assert.equal(assignStatement(new Date("2026-10-26T12:00:00Z"), status), "next");
  assert.equal(assignStatement(new Date("2026-11-09T12:00:00Z"), status, true), "current");
  assert.equal(assignStatement(new Date("2026-09-01T12:00:00Z"), status), null);

  const afterDue = computeCreditCardStatus(25, fixed(10, 1), new Date("2026-11-11T12:00:00Z"));
  assert.equal(isoDay(afterDue.currentCloseDate), "2026-11-25");
  assert.equal(isoDay(afterDue.currentDueDate), "2026-12-10");
});

test("closing on day 31 clamps in February without shifting later months", () => {
  const feb = computeCreditCardStatus(31, fixed(5, 1), new Date("2027-02-01T12:00:00Z"));
  assert.equal(isoDay(feb.currentCloseDate), "2027-01-31");
  assert.equal(isoDay(feb.currentDueDate), "2027-02-05");
  assert.equal(isoDay(feb.nextCloseDate), "2027-02-28");
  assert.equal(isoDay(feb.nextDueDate), "2027-03-05");

  const leap = computeCreditCardStatus(31, fixed(5, 1), new Date("2028-02-06T12:00:00Z"));
  assert.equal(isoDay(leap.currentCloseDate), "2028-02-29");
  assert.equal(isoDay(leap.currentDueDate), "2028-03-05");
});

test("same-month due dates and year boundaries remain stable", () => {
  const sameMonth = computeCreditCardStatus(5, fixed(20, 0), new Date("2026-10-06T12:00:00Z"));
  assert.equal(isoDay(sameMonth.currentCloseDate), "2026-10-05");
  assert.equal(isoDay(sameMonth.currentDueDate), "2026-10-20");

  const yearEnd = computeCreditCardStatus(25, fixed(10, 1), new Date("2026-12-26T12:00:00Z"));
  assert.equal(isoDay(yearEnd.currentDueDate), "2027-01-10");
  assert.equal(isoDay(yearEnd.nextDueDate), "2027-02-10");

  const shortMonth = computeCreditCardStatus(28, fixed(30, 0), new Date("2027-02-25T12:00:00Z"));
  assert.equal(isoDay(shortMonth.currentCloseDate), "2027-02-28");
  assert.equal(isoDay(shortMonth.currentDueDate), "2027-03-01");
});

test("the current day follows Argentina time around UTC midnight", () => {
  assert.equal(isoDay(argentinaCalendarDay(new Date("2026-10-10T01:30:00Z")).toISOString()), "2026-10-09");
});
