import type { FastifyPluginAsync } from "fastify";
import { toPrismaDecimal } from "../../lib/decimal.js";
import { getCurrentRate } from "../rates/service.js";
import { computeDualAmounts } from "../transactions/service.js";
import { CreateInvestmentBody, InvestmentIdParam, UpdateInvestmentBody } from "./schemas.js";
import { serializeInvestment, summarizeInvestments } from "./service.js";

const investmentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

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
