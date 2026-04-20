import type { FastifyPluginAsync } from "fastify";

// TODO: Phase 5 — wire this up to n8n → WhatsApp Business API. For now we only
// acknowledge requests so external systems can be configured ahead of time.
const whatsappRoutes: FastifyPluginAsync = async (app) => {
  app.post("/whatsapp", async (req, reply) => {
    app.log.info({ headers: req.headers, body: req.body }, "whatsapp webhook received (stub)");
    return reply.code(200).send({ ok: true });
  });
};

export default whatsappRoutes;
