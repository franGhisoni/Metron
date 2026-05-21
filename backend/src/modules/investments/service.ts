import type { Investment } from "@prisma/client";
import { Decimal, serializeDecimal } from "../../lib/decimal.js";

const priceOrPurchase = (current: Investment["currentPriceArs"], purchase: Investment["purchasePriceArs"]) =>
  current ?? purchase;

export const serializeInvestment = (investment: Investment) => {
  const quantity = new Decimal(investment.quantity.toString());
  const investedArs = quantity.mul(investment.purchasePriceArs.toString());
  const investedUsd = quantity.mul(investment.purchasePriceUsd.toString());
  const currentPriceArs = priceOrPurchase(investment.currentPriceArs, investment.purchasePriceArs);
  const currentPriceUsd = priceOrPurchase(investment.currentPriceUsd, investment.purchasePriceUsd);
  const currentValueArs = quantity.mul(currentPriceArs.toString());
  const currentValueUsd = quantity.mul(currentPriceUsd.toString());
  const pnlArs = currentValueArs.minus(investedArs);
  const pnlUsd = currentValueUsd.minus(investedUsd);

  return {
    id: investment.id,
    symbol: investment.symbol,
    name: investment.name,
    assetType: investment.assetType,
    quantity: serializeDecimal(investment.quantity)!,
    purchasePriceUsd: serializeDecimal(investment.purchasePriceUsd)!,
    purchasePriceArs: serializeDecimal(investment.purchasePriceArs)!,
    purchaseDate: investment.purchaseDate.toISOString(),
    exchangeRateAtPurchase: serializeDecimal(investment.exchangeRateAtPurchase)!,
    currentPriceUsd: serializeDecimal(investment.currentPriceUsd),
    currentPriceArs: serializeDecimal(investment.currentPriceArs),
    lastPriceUpdatedAt: investment.lastPriceUpdatedAt?.toISOString() ?? null,
    notes: investment.notes,
    createdAt: investment.createdAt.toISOString(),
    updatedAt: investment.updatedAt.toISOString(),
    metrics: {
      invested: {
        ars: investedArs.toString(),
        usd: investedUsd.toString(),
      },
      currentValue: {
        ars: currentValueArs.toString(),
        usd: currentValueUsd.toString(),
      },
      pnl: {
        ars: pnlArs.toString(),
        usd: pnlUsd.toString(),
      },
      pnlPct: {
        ars: investedArs.gt(0) ? pnlArs.div(investedArs).toNumber() : null,
        usd: investedUsd.gt(0) ? pnlUsd.div(investedUsd).toNumber() : null,
      },
    },
  };
};

export const summarizeInvestments = (investments: Investment[]) => {
  const totals = investments.reduce(
    (acc, investment) => {
      const serialized = serializeInvestment(investment);
      acc.invested.ars = acc.invested.ars.plus(serialized.metrics.invested.ars);
      acc.invested.usd = acc.invested.usd.plus(serialized.metrics.invested.usd);
      acc.currentValue.ars = acc.currentValue.ars.plus(serialized.metrics.currentValue.ars);
      acc.currentValue.usd = acc.currentValue.usd.plus(serialized.metrics.currentValue.usd);
      return acc;
    },
    {
      invested: { ars: new Decimal(0), usd: new Decimal(0) },
      currentValue: { ars: new Decimal(0), usd: new Decimal(0) },
    }
  );
  const pnl = {
    ars: totals.currentValue.ars.minus(totals.invested.ars),
    usd: totals.currentValue.usd.minus(totals.invested.usd),
  };

  const byAssetType = new Map<string, { ars: Decimal; usd: Decimal }>();
  for (const investment of investments) {
    const serialized = serializeInvestment(investment);
    const bucket = byAssetType.get(investment.assetType) ?? {
      ars: new Decimal(0),
      usd: new Decimal(0),
    };
    bucket.ars = bucket.ars.plus(serialized.metrics.currentValue.ars);
    bucket.usd = bucket.usd.plus(serialized.metrics.currentValue.usd);
    byAssetType.set(investment.assetType, bucket);
  }

  return {
    invested: {
      ars: totals.invested.ars.toString(),
      usd: totals.invested.usd.toString(),
    },
    currentValue: {
      ars: totals.currentValue.ars.toString(),
      usd: totals.currentValue.usd.toString(),
    },
    pnl: {
      ars: pnl.ars.toString(),
      usd: pnl.usd.toString(),
    },
    pnlPct: {
      ars: totals.invested.ars.gt(0) ? pnl.ars.div(totals.invested.ars).toNumber() : null,
      usd: totals.invested.usd.gt(0) ? pnl.usd.div(totals.invested.usd).toNumber() : null,
    },
    byAssetType: Array.from(byAssetType.entries()).map(([assetType, value]) => ({
      assetType,
      value: {
        ars: value.ars.toString(),
        usd: value.usd.toString(),
      },
    })),
  };
};
