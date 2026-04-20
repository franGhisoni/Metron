import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return reply.code(409).send({ error: "conflict", field: err.meta?.target });
      }
      if (err.code === "P2025") {
        return reply.code(404).send({ error: "not_found" });
      }
    }

    // Fastify validation (schema) errors
    if (err.validation) {
      return reply.code(400).send({ error: "validation_error", issues: err.validation });
    }

    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      req.log.error({ err }, "unhandled_error");
    }
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "internal_error" : err.message,
    });
  });
});
