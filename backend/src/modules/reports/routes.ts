import type { FastifyPluginAsync } from "fastify";
import { ReportsRangeQuery } from "./schemas.js";
import { getMonthlySeries, getNetWorthHistory } from "./service.js";

const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/monthly-series", async (req) => {
    const q = ReportsRangeQuery.parse(req.query);

    return {
      months: q.months,
      items: await getMonthlySeries(app.prisma, req.userId, q.months),
    };
  });

  app.get("/net-worth-history", async (req) => {
    const q = ReportsRangeQuery.parse(req.query);

    return {
      months: q.months,
      items: await getNetWorthHistory(app.prisma, app.redis, req.userId, q.months),
    };
  });
};

export default reportRoutes;
