import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import Redis from "ioredis";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async (app: FastifyInstance) => {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  redis.on("error", (err) => app.log.error({ err }, "redis error"));
  app.decorate("redis", redis);
  app.addHook("onClose", async () => {
    await redis.quit();
  });
});
