import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { Decimal, serializeDecimal } from "../../lib/decimal.js";
import { getCurrentRate } from "../rates/service.js";
import { getBalanceDelta } from "../transactions/balance.js";

type DualDecimal = { ars: Decimal; usd: Decimal };

type MonthFrame = {
  year: number;
  month: number;
  label: string;
  start: Date;
};

const pad = (value: number) => value.toString().padStart(2, "0");

const buildMonthFrames = (months: number, now = new Date()): MonthFrame[] => {
  const frames: MonthFrame[] = [];
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(currentYear, currentMonth - offset, 1));
    frames.push({
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      label: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`,
      start,
    });
  }

  return frames;
};

const dualZero = (): DualDecimal => ({ ars: new Decimal(0), usd: new Decimal(0) });

const serializeDual = (amounts: DualDecimal) => ({
  ars: amounts.ars.toString(),
  usd: amounts.usd.toString(),
});

const snapshotDateForFrame = (_frame: MonthFrame, nextFrame: MonthFrame | null, now: Date): Date => {
  if (!nextFrame) return now;
  return new Date(nextFrame.start.getTime() - 1);
};

const resolveRateAt = async (
  prisma: PrismaClient,
  redis: Redis,
  points: Date[]
): Promise<Map<string, string>> => {
  const rateRows = await prisma.exchangeRate.findMany({
    where: { rateType: "blue" },
    orderBy: { date: "asc" },
    select: { date: true, rate: true },
  });

  const lastRateRow = rateRows[rateRows.length - 1];
  const latestStoredRate = lastRateRow ? (serializeDecimal(lastRateRow.rate) ?? null) : null;
  const fallbackRate = latestStoredRate ?? (await getCurrentRate(prisma, redis, "blue"));

  const bySnapshot = new Map<string, string>();
  let rowIndex = 0;
  let latestRate = fallbackRate;

  for (const point of points) {
    while (rowIndex < rateRows.length) {
      const rateRow = rateRows[rowIndex]!;
      if (rateRow.date > point) break;

      latestRate = serializeDecimal(rateRow.rate) ?? latestRate;
      rowIndex += 1;
    }
    bySnapshot.set(point.toISOString(), latestRate);
  }

  return bySnapshot;
};

export const getMonthlySeries = async (prisma: PrismaClient, userId: string, months: number) => {
  const frames = buildMonthFrames(months);
  const firstFrame = frames[0]!;
  const lastFrame = frames[frames.length - 1]!;
  const rangeEnd = new Date(Date.UTC(lastFrame.year, lastFrame.month, 1));

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      transactionDate: {
        gte: firstFrame.start,
        lt: rangeEnd,
      },
    },
    select: {
      type: true,
      amountArs: true,
      amountUsd: true,
      transactionDate: true,
    },
  });

  const buckets = new Map<string, { year: number; month: number; label: string; income: DualDecimal; expense: DualDecimal }>();
  for (const frame of frames) {
    buckets.set(frame.label, {
      year: frame.year,
      month: frame.month,
      label: frame.label,
      income: dualZero(),
      expense: dualZero(),
    });
  }

  for (const row of rows) {
    if (row.type === "transfer") continue;

    const label = `${row.transactionDate.getUTCFullYear()}-${pad(row.transactionDate.getUTCMonth() + 1)}`;
    const bucket = buckets.get(label);
    if (!bucket) continue;

    const target = row.type === "income" ? bucket.income : bucket.expense;
    target.ars = target.ars.plus(row.amountArs.toString());
    target.usd = target.usd.plus(row.amountUsd.toString());
  }

  return frames.map((frame) => {
    const bucket = buckets.get(frame.label)!;
    const net = {
      ars: bucket.income.ars.minus(bucket.expense.ars),
      usd: bucket.income.usd.minus(bucket.expense.usd),
    };

    return {
      year: bucket.year,
      month: bucket.month,
      label: bucket.label,
      monthStart: frame.start.toISOString(),
      income: serializeDual(bucket.income),
      expense: serializeDual(bucket.expense),
      net: serializeDual(net),
    };
  });
};

export const getNetWorthHistory = async (
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  months: number
) => {
  const now = new Date();
  const frames = buildMonthFrames(months, now);
  const points = frames.map((frame, index) =>
    snapshotDateForFrame(frame, frames[index + 1] ?? null, now)
  );
  const ratesBySnapshot = await resolveRateAt(prisma, redis, points);

  const accounts = await prisma.account.findMany({
    where: {
      userId,
      type: { not: "credit_card" },
    },
    select: {
      id: true,
      currency: true,
      balance: true,
    },
  });

  const emptySeries = frames.map((frame, index) => {
    const snapshotDate = points[index]!;
    return {
      year: frame.year,
      month: frame.month,
      label: frame.label,
      snapshotDate: snapshotDate.toISOString(),
      exchangeRate: ratesBySnapshot.get(snapshotDate.toISOString()) ?? "0",
      netWorth: { ars: "0", usd: "0" },
    };
  });

  if (accounts.length === 0) return emptySeries;

  const accountIds = accounts.map((account) => account.id);
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));
  const balances = new Map<string, Decimal>(
    accounts.map((account) => [account.id, new Decimal(account.balance.toString())])
  );

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      accountId: { in: accountIds },
      transactionDate: { gte: frames[0]!.start },
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      accountId: true,
      type: true,
      status: true,
      amountArs: true,
      amountUsd: true,
      linkedTransactionId: true,
      transactionDate: true,
    },
  });

  const linkedIds = Array.from(
    new Set(rows.map((row) => row.linkedTransactionId).filter((value): value is string => !!value))
  );
  const linkedRows =
    linkedIds.length > 0
      ? await prisma.transaction.findMany({
          where: { id: { in: linkedIds } },
          select: {
            id: true,
            account: { select: { type: true } },
          },
        })
      : [];
  const linkedTypeById = new Map(
    linkedRows.map((row) => [row.id, row.account.type] as const)
  );

  const framesDesc = [...frames].reverse();
  const pointsDesc = [...points].reverse();
  const seriesDesc: Array<{
    year: number;
    month: number;
    label: string;
    snapshotDate: string;
    exchangeRate: string;
    netWorth: { ars: string; usd: string };
  }> = [];

  let txIndex = 0;

  for (let index = 0; index < framesDesc.length; index += 1) {
    if (index > 0) {
      const boundary = framesDesc[index - 1]!.start;
      while (txIndex < rows.length && rows[txIndex]!.transactionDate >= boundary) {
        const row = rows[txIndex]!;
        const account = accountById.get(row.accountId);
        if (account) {
          const delta = getBalanceDelta(
            {
              type: row.type,
              status: row.status,
              amountArs: row.amountArs.toString(),
              amountUsd: row.amountUsd.toString(),
            },
            {
              id: account.id,
              currency: account.currency as "ARS" | "USD",
              type: "asset",
            },
            row.linkedTransactionId ? (linkedTypeById.get(row.linkedTransactionId) ?? null) : null
          );

          if (delta) {
            balances.set(row.accountId, (balances.get(row.accountId) ?? new Decimal(0)).minus(delta));
          }
        }

        txIndex += 1;
      }
    }

    const snapshot = pointsDesc[index]!;
    const exchangeRate = ratesBySnapshot.get(snapshot.toISOString()) ?? "0";
    const rate = new Decimal(exchangeRate || "0");
    const totals = dualZero();
    const frame = framesDesc[index]!;

    for (const account of accounts) {
      const balance = balances.get(account.id) ?? new Decimal(0);
      if (account.currency === "ARS") {
        totals.ars = totals.ars.plus(balance);
        totals.usd = rate.gt(0) ? totals.usd.plus(balance.div(rate)) : totals.usd;
      } else {
        totals.usd = totals.usd.plus(balance);
        totals.ars = rate.gt(0) ? totals.ars.plus(balance.mul(rate)) : totals.ars;
      }
    }

    seriesDesc.push({
      year: frame.year,
      month: frame.month,
      label: frame.label,
      snapshotDate: snapshot.toISOString(),
      exchangeRate,
      netWorth: serializeDual(totals),
    });
  }

  return seriesDesc.reverse();
};
