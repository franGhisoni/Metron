import type { FastifyPluginAsync } from "fastify";
import { CreateGroupBody, GroupIdParam, UpdateGroupBody } from "./schemas.js";

const groupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    return app.prisma.transactionGroup.findMany({
      where: { userId: req.userId },
      orderBy: [{ name: "asc" }],
    });
  });

  app.post("/", async (req, reply) => {
    const body = CreateGroupBody.parse(req.body);

    const duplicate = await app.prisma.transactionGroup.findFirst({
      where: {
        userId: req.userId,
        name: body.name,
      },
      select: { id: true },
    });
    if (duplicate) return reply.code(409).send({ error: "group_already_exists" });

    const created = await app.prisma.transactionGroup.create({
      data: {
        userId: req.userId,
        ...body,
      },
    });
    return reply.code(201).send(created);
  });

  app.put("/:id", async (req, reply) => {
    const { id } = GroupIdParam.parse(req.params);
    const body = UpdateGroupBody.parse(req.body);

    const existing = await app.prisma.transactionGroup.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (body.name) {
      const duplicate = await app.prisma.transactionGroup.findFirst({
        where: {
          userId: req.userId,
          name: body.name,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) return reply.code(409).send({ error: "group_already_exists" });
    }

    const updated = await app.prisma.transactionGroup.update({
      where: { id },
      data: body,
    });
    return reply.send(updated);
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = GroupIdParam.parse(req.params);
    const existing = await app.prisma.transactionGroup.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    await app.prisma.transactionGroup.delete({ where: { id } });
    return reply.code(204).send();
  });
};

export default groupRoutes;
