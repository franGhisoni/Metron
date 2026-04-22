import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import errorHandler from "./plugins/errorHandler.js";

import authRoutes from "./modules/auth/routes.js";
import accountRoutes from "./modules/accounts/routes.js";
import transactionRoutes from "./modules/transactions/routes.js";
import categoryRoutes from "./modules/categories/routes.js";
import rateRoutes from "./modules/rates/routes.js";
import whatsappRoutes from "./modules/webhooks/whatsapp.js";
import { startRateFetchJob } from "./modules/rates/job.js";
import { startRecurringJob } from "./modules/transactions/recurringJob.js";

const buildServer = async () => {
  // Fastify uses Pino internally — don't pass a Winston instance as loggerInstance.
  // Winston is used for application-level structured logging via the `logger` import.
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
          : undefined,
    },
    trustProxy: true,
  });

  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(errorHandler);

  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(accountRoutes, { prefix: "/api/accounts" });
  await app.register(transactionRoutes, { prefix: "/api/transactions" });
  await app.register(categoryRoutes, { prefix: "/api/categories" });
  await app.register(rateRoutes, { prefix: "/api/rates" });
  await app.register(whatsappRoutes, { prefix: "/api/webhooks" });

  return app;
};

const start = async () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  try {
    app = await buildServer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("failed to build server", { message, stack });
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    startRateFetchJob(app);          // register onClose hook before listen
    startRecurringJob(app);
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }
};

void start();
