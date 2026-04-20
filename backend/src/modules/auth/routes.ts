import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { RegisterBody, LoginBody } from "./schemas.js";
import {
  createDefaultCategoriesForUser,
  hashPassword,
  persistRefreshToken,
  refreshCookieOptions,
  revokeAllUserRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from "./service.js";

const REFRESH_COOKIE = "metron_rt";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (req, reply) => {
    const body = RegisterBody.parse(req.body);

    const existing = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: "email_taken" });

    const passwordHash = await hashPassword(body.password);
    const user = await app.prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        phone: body.phone ?? null,
      },
      select: { id: true, email: true, phone: true, currencyPref: true },
    });

    await createDefaultCategoriesForUser(app.prisma, user.id);

    const jti = crypto.randomUUID();
    const accessToken = app.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = app.signRefreshToken({ sub: user.id, jti });
    await persistRefreshToken(app.prisma, user.id, refreshToken, jti);

    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return reply.code(201).send({ user, accessToken });
  });

  app.post("/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);

    const user = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(401).send({ error: "invalid_credentials" });

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });

    const jti = crypto.randomUUID();
    const accessToken = app.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = app.signRefreshToken({ sub: user.id, jti });
    await persistRefreshToken(app.prisma, user.id, refreshToken, jti);

    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        currencyPref: user.currencyPref,
      },
      accessToken,
    });
  });

  app.post("/refresh", async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) return reply.code(401).send({ error: "missing_refresh_token" });

    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value === null) {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    let payload;
    try {
      payload = app.verifyRefreshToken(unsigned.value);
    } catch {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const rotated = await rotateRefreshToken(app.prisma, payload.jti, unsigned.value);
    if (!rotated) {
      // Possible reuse attack — revoke all tokens for the user as a safety net.
      await revokeAllUserRefreshTokens(app.prisma, payload.sub);
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, phone: true, currencyPref: true },
    });
    if (!user) return reply.code(401).send({ error: "invalid_refresh_token" });

    const newJti = crypto.randomUUID();
    const accessToken = app.signAccessToken({ sub: user.id, email: user.email });
    const newRefresh = app.signRefreshToken({ sub: user.id, jti: newJti });
    await persistRefreshToken(app.prisma, user.id, newRefresh, newJti);

    reply.setCookie(REFRESH_COOKIE, newRefresh, refreshCookieOptions());
    return reply.send({ user, accessToken });
  });

  app.post("/logout", async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        try {
          const payload = app.verifyRefreshToken(unsigned.value);
          await revokeRefreshToken(app.prisma, payload.jti);
        } catch {
          // ignore
        }
      }
    }
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return reply.send({ ok: true });
  });

  app.get("/me", { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        currencyPref: true,
        fiftyThirtyTwenty: true,
        liquidityAlertThreshold: true,
      },
    });
    if (!user) return reply.code(404).send({ error: "not_found" });
    return reply.send({
      ...user,
      liquidityAlertThreshold: user.liquidityAlertThreshold?.toString() ?? null,
    });
  });
};

export default authRoutes;
