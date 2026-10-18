import type { FastifyPluginAsync } from "fastify";
import { toPrismaDecimal } from "../../lib/decimal.js";
import { getCurrentRate } from "../rates/service.js";
import { computeDualAmounts } from "../transactions/service.js";
import { CreateInvestmentBody, InvestmentIdParam, UpdateInvestmentBody } from "./schemas.js";
import { serializeInvestment, summarizeInvestments } from "./service.js";
import { Decimal } from "../../lib/decimal.js";
import { getYahooQuote, quoteSymbolFor } from "./quotes.js";

const investmentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/refresh-prices", {
    config: { rateLimit: { max: 2, timeWindow: "1 minute" } },
  }, async (req) => {
    const rows = await app.prisma.investment.findMany({ where: { userId: req.userId } });
    const results: Array<{ id: string; symbol: string; status: "updated" | "skipped" | "error"; message: string }> = [];
    let rate: string | undefined;
    const deadline = Date.now() + 20_000;
    // Reuse each symbol within a portfolio, including failed lookups.
    const quotes = new Map<string, ReturnType<typeof getYahooQuote>>();
    for (const row of rows) {
      const symbol = quoteSymbolFor(row.symbol, row.assetType);
      if (!symbol) {
        results.push({ id: row.id, symbol: row.symbol, status: "skipped", message: "Sin cobertura automática: usá el ticker exacto de Yahoo (cripto: BTC-USD; CEDEAR: sufijo .BA). Bonos, FCI y plazos fijos requieren precio manual." });
        continue;
      }
      if (Date.now() >= deadline) {
        results.push({ id: row.id, symbol, status: "skipped", message: "Se alcanzó el tiempo de actualización. Volvé a intentar para completar la cartera." });
        continue;
      }
      try {
        if (!quotes.has(symbol)) quotes.set(symbol, getYahooQuote(app.redis, symbol));
        const quote = await quotes.get(symbol)!;
        if (row.assetType === "cedear" && quote.currency !== "ARS") throw new Error("cedear_currency_mismatch");
        // Old quotes must never overwrite a newer manual valuation.
        if (row.lastPriceUpdatedAt && new Date(quote.marketTime) <= row.lastPriceUpdatedAt) {
          results.push({ id: row.id, symbol, status: "skipped", message: "El precio guardado es igual o más reciente que la cotización disponible." });
          continue;
        }
        rate ??= await getCurrentRate(app.prisma, app.redis, "blue");
        if (!new Decimal(rate).isFinite() || new Decimal(rate).lte(0)) throw new Error("invalid_exchange_rate");
        const current = computeDualAmounts(quote.price, quote.currency, rate);
        // Do not overwrite an edit made while the provider was responding.
        const saved = await app.prisma.investment.updateMany({
          where: { id: row.id, userId: req.userId, updatedAt: row.updatedAt },
          data: {
            currentPriceArs: toPrismaDecimal(current.amountArs),
            currentPriceUsd: toPrismaDecimal(current.amountUsd),
            lastPriceUpdatedAt: new Date(quote.marketTime),
          },
        });
        results.push({ id: row.id, symbol, status: saved.count ? "updated" : "skipped", message: saved.count ? "Cotización actualizada desde Yahoo Finance." : "La posición fue modificada durante la consulta; volvé a actualizar." });
      } catch (err) {
        req.log.warn({ err, symbol }, "investment price refresh failed");
        results.push({ id: row.id, symbol, status: "error", message: "No se pudo obtener una cotización válida o convertirla. Se conservó el precio anterior." });
      }
    }
    return { source: "yahoo" as const, conversionRateType: "blue" as const, results };
  });

  app.get("/", async (req) => {
    const rows = await app.prisma.investment.findMany({
      where: { userId: req.userId },
      orderBy: [{ assetType: "asc" }, { symbol: "asc" }],
    });
    return rows.map(serializeInvestment);
  });

  app.get("/summary", async (req) => {
    const rows = await app.prisma.investment.findMany({
      where: { userId: req.userId },
    });
    return summarizeInvestments(rows);
  });

  app.post("/", async (req, reply) => {
    const body = CreateInvestmentBody.parse(req.body);
    const rate =
      body.exchangeRateAtPurchase ?? (await getCurrentRate(app.prisma, app.redis, "blue"));
    const purchase = computeDualAmounts(body.purchasePrice, body.purchaseCurrency, rate);
    const current =
      body.currentPrice && body.currentPriceCurrency
        ? computeDualAmounts(body.currentPrice, body.currentPriceCurrency, rate)
        : null;

    const created = await app.prisma.investment.create({
      data: {
        userId: req.userId,
        symbol: body.symbol,
        name: body.name,
        assetType: body.assetType,
        quantity: toPrismaDecimal(body.quantity),
        purchasePriceUsd: toPrismaDecimal(purchase.amountUsd),
        purchasePriceArs: toPrismaDecimal(purchase.amountArs),
        purchaseDate: new Date(body.purchaseDate),
        exchangeRateAtPurchase: toPrismaDecimal(rate),
        currentPriceUsd: current ? toPrismaDecimal(current.amountUsd) : null,
        currentPriceArs: current ? toPrismaDecimal(current.amountArs) : null,
        lastPriceUpdatedAt: current ? new Date() : null,
        notes: body.notes ?? null,
      },
    });

    return reply.code(201).send(serializeInvestment(created));
  });

  app.put("/:id", async (req, reply) => {
    const { id } = InvestmentIdParam.parse(req.params);
    const body = UpdateInvestmentBody.parse(req.body);

    const existing = await app.prisma.investment.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const data: Record<string, unknown> = {
      ...(body.symbol !== undefined ? { symbol: body.symbol } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.assetType !== undefined ? { assetType: body.assetType } : {}),
      ...(body.quantity !== undefined ? { quantity: toPrismaDecimal(body.quantity) } : {}),
      ...(body.purchaseDate !== undefined ? { purchaseDate: new Date(body.purchaseDate) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };

    if (body.purchasePrice !== undefined && body.purchaseCurrency) {
      const rate =
        body.exchangeRateAtPurchase ??
        existing.exchangeRateAtPurchase.toString() ??
        (await getCurrentRate(app.prisma, app.redis, "blue"));
      const purchase = computeDualAmounts(body.purchasePrice, body.purchaseCurrency, rate);
      data.purchasePriceUsd = toPrismaDecimal(purchase.amountUsd);
      data.purchasePriceArs = toPrismaDecimal(purchase.amountArs);
      data.exchangeRateAtPurchase = toPrismaDecimal(rate);
    } else if (body.exchangeRateAtPurchase !== undefined) {
      data.exchangeRateAtPurchase = toPrismaDecimal(body.exchangeRateAtPurchase);
    }

    if (body.currentPrice === null) {
      data.currentPriceUsd = null;
      data.currentPriceArs = null;
      data.lastPriceUpdatedAt = null;
    } else if (body.currentPrice !== undefined && body.currentPriceCurrency) {
      const rate =
        body.exchangeRateAtPurchase ??
        existing.exchangeRateAtPurchase.toString() ??
        (await getCurrentRate(app.prisma, app.redis, "blue"));
      const current = computeDualAmounts(body.currentPrice, body.currentPriceCurrency, rate);
      data.currentPriceUsd = toPrismaDecimal(current.amountUsd);
      data.currentPriceArs = toPrismaDecimal(current.amountArs);
      data.lastPriceUpdatedAt = new Date();
    }

    const updated = await app.prisma.investment.update({
      where: { id },
      data,
    });

    return reply.send(serializeInvestment(updated));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = InvestmentIdParam.parse(req.params);
    const existing = await app.prisma.investment.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    await app.prisma.investment.delete({ where: { id } });
    return reply.code(204).send();
  });
};

export default investmentRoutes;
