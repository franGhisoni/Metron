import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { refreshAllRates } from "./service.js";

export const startRateFetchJob = (app: FastifyInstance) => {
  const run = async () => {
    try {
      const res = await refreshAllRates(app.prisma, app.redis);
      app.log.info({ rates: res }, "exchange rates refreshed");
    } catch (err) {
      app.log.error({ err }, "rate fetch job error");
    }
  };

  // Fire once at startup, then every interval.
  void run();
  const handle = setInterval(run, env.RATE_FETCH_INTERVAL_MS);
  app.addHook("onClose", async () => {
    clearInterval(handle);
  });
};
