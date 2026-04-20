import type { FastifyPluginAsync } from "fastify";
import {
  CategoryIdParam,
  CreateCategoryBody,
  UpdateCategoryBody,
} from "./schemas.js";

const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    return app.prisma.category.findMany({
      where: { userId: req.userId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  });

  app.post("/", async (req, reply) => {
    const body = CreateCategoryBody.parse(req.body);

    if (body.parentId) {
      const parent = await app.prisma.category.findFirst({
        where: { id: body.parentId, userId: req.userId },
      });
      if (!parent) return reply.code(404).send({ error: "parent_not_found" });
    }

    const created = await app.prisma.category.create({
      data: { ...body, userId: req.userId, parentId: body.parentId ?? null },
    });
    return reply.code(201).send(created);
  });

  app.put("/:id", async (req, reply) => {
    const { id } = CategoryIdParam.parse(req.params);
    const body = UpdateCategoryBody.parse(req.body);

    const existing = await app.prisma.category.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (body.parentId !== undefined && body.parentId !== null) {
      if (body.parentId === id) {
        return reply.code(400).send({ error: "cannot_parent_to_self" });
      }
      const parent = await app.prisma.category.findFirst({
        where: { id: body.parentId, userId: req.userId },
      });
      if (!parent) return reply.code(404).send({ error: "parent_not_found" });
    }

    const updated = await app.prisma.category.update({ where: { id }, data: body });
    return reply.send(updated);
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = CategoryIdParam.parse(req.params);
    const existing = await app.prisma.category.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    await app.prisma.$transaction([
      app.prisma.category.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      }),
      app.prisma.category.delete({ where: { id } }),
    ]);
    return reply.code(204).send();
  });
};

export default categoryRoutes;
