import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAllCurrentRates, RATE_TYPES } from "./service.js";
import { serializeDecimal } from "../../lib/decimal.js";

const HistoryQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  type: z.enum(RATE_TYPES).optional(),
});

const rateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/current", async () => {
    const rates = await getAllCurrentRates(app.prisma, app.redis);
    return { rates, at: new Date().toISOString() };
  });

  app.get("/history", async (req) => {
    const q = HistoryQuery.parse(req.query);
    const rows = await app.prisma.exchangeRate.findMany({
      where: {
        ...(q.type ? { rateType: q.type } : {}),
        ...(q.from || q.to
          ? {
              date: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
      take: 5000,
    });
    return rows.map((r) => ({
      date: r.date.toISOString(),
      rateType: r.rateType,
      rate: serializeDecimal(r.rate) ?? "0",
      source: r.source,
    }));
  });
};

export default rateRoutes;
