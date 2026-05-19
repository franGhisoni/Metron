import type { FastifyPluginAsync } from "fastify";
import { toPrismaDecimal } from "../../lib/decimal.js";
import { CreateGoalBody, GoalIdParam, UpdateGoalBody } from "./schemas.js";
import { serializeGoal } from "./service.js";

const goalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    const rows = await app.prisma.savingsGoal.findMany({
      where: { userId: req.userId },
      orderBy: [{ status: "asc" }, { targetDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(serializeGoal);
  });

  app.post("/", async (req, reply) => {
    const body = CreateGoalBody.parse(req.body);
    const created = await app.prisma.savingsGoal.create({
      data: {
        userId: req.userId,
        name: body.name,
        targetAmount: toPrismaDecimal(body.targetAmount),
        currency: body.currency,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        currentAmount: toPrismaDecimal(body.currentAmount),
        status: body.status,
      },
    });
    return reply.code(201).send(serializeGoal(created));
  });

  app.put("/:id", async (req, reply) => {
    const { id } = GoalIdParam.parse(req.params);
    const body = UpdateGoalBody.parse(req.body);

    const existing = await app.prisma.savingsGoal.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const updated = await app.prisma.savingsGoal.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.targetAmount !== undefined
          ? { targetAmount: toPrismaDecimal(body.targetAmount) }
          : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.targetDate !== undefined
          ? { targetDate: body.targetDate ? new Date(body.targetDate) : null }
          : {}),
        ...(body.currentAmount !== undefined
          ? { currentAmount: toPrismaDecimal(body.currentAmount) }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    return reply.send(serializeGoal(updated));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = GoalIdParam.parse(req.params);
    const existing = await app.prisma.savingsGoal.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    await app.prisma.savingsGoal.delete({ where: { id } });
    return reply.code(204).send();
  });
};

export default goalRoutes;
