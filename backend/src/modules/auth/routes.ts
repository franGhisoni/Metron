import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { RegisterBody, LoginBody, UpdateMeBody } from "./schemas.js";
import {
  createDefaultCategoriesForUser,
  hashPassword,
  persistRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from "./service.js";

const REFRESH_COOKIE = "metron_rt";

const userSelect = {
  id: true,
  email: true,
  phone: true,
  currencyPref: true,
  fiftyThirtyTwenty: true,
  liquidityAlertThreshold: true,
} as const;

const serializeUser = (user: {
  id: string;
  email: string;
  phone: string | null;
  currencyPref: string;
  fiftyThirtyTwenty: boolean;
  liquidityAlertThreshold: { toString: () => string } | null;
}) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  currencyPref: user.currencyPref,
  fiftyThirtyTwenty: user.fiftyThirtyTwenty,
  liquidityAlertThreshold: user.liquidityAlertThreshold?.toString() ?? null,
});

// Extract a refresh token from the request body (localStorage flow) or the
// signed httpOnly cookie (fallback). Returns the raw JWT string or null.
const extractRefreshToken = (
  cookies: Record<string, string | undefined>,
  unsignCookie: (value: string) => { valid: boolean; value: string | null },
  body: { refreshToken?: string } | null
): string | null => {
  if (body?.refreshToken) return body.refreshToken;

  const raw = cookies[REFRESH_COOKIE];
  if (!raw) return null;
  const unsigned = unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
};

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
      select: userSelect,
    });

    await createDefaultCategoriesForUser(app.prisma, user.id);

    const jti = crypto.randomUUID();
    const accessToken = app.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = app.signRefreshToken({ sub: user.id, jti });
    await persistRefreshToken(app.prisma, user.id, refreshToken, jti);

    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return reply.code(201).send({ user: serializeUser(user), accessToken, refreshToken });
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
      user: serializeUser(user),
      accessToken,
      refreshToken,
    });
  });

  app.post("/refresh", async (req, reply) => {
    const tokenValue = extractRefreshToken(req.cookies, req.unsignCookie, req.body as { refreshToken?: string } | null);
    if (!tokenValue) {
      req.log.warn({ cookies: Object.keys(req.cookies) }, "refresh: no token in body or cookie");
      return reply.code(401).send({ error: "missing_refresh_token" });
    }

    let payload;
    try {
      payload = app.verifyRefreshToken(tokenValue);
    } catch {
      req.log.warn("refresh: JWT verification failed");
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const rotated = await rotateRefreshToken(app.prisma, payload.jti, tokenValue);
    if (!rotated) {
      req.log.warn({ jti: payload.jti }, "refresh: token already rotated or expired");
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: payload.sub },
      select: userSelect,
    });
    if (!user) return reply.code(401).send({ error: "invalid_refresh_token" });

    const newJti = crypto.randomUUID();
    const accessToken = app.signAccessToken({ sub: user.id, email: user.email });
    const newRefresh = app.signRefreshToken({ sub: user.id, jti: newJti });
    await persistRefreshToken(app.prisma, user.id, newRefresh, newJti);

    reply.setCookie(REFRESH_COOKIE, newRefresh, refreshCookieOptions());
    return reply.send({ user: serializeUser(user), accessToken, refreshToken: newRefresh });
  });

  app.post("/logout", async (req, reply) => {
    const tokenValue = extractRefreshToken(
      req.cookies,
      req.unsignCookie,
      req.body as { refreshToken?: string } | null
    );
    if (tokenValue) {
      try {
        const payload = app.verifyRefreshToken(tokenValue);
        await revokeRefreshToken(app.prisma, payload.jti);
      } catch {
        // ignore — token might already be invalid
      }
    }
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return reply.send({ ok: true });
  });

  app.get("/me", { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.userId },
      select: userSelect,
    });
    if (!user) return reply.code(404).send({ error: "not_found" });
    return reply.send(serializeUser(user));
  });

  app.patch("/me", { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = UpdateMeBody.parse(req.body);

    const user = await app.prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.currencyPref !== undefined ? { currencyPref: body.currencyPref } : {}),
        ...(body.fiftyThirtyTwenty !== undefined
          ? { fiftyThirtyTwenty: body.fiftyThirtyTwenty }
          : {}),
        ...(body.liquidityAlertThreshold !== undefined
          ? {
              liquidityAlertThreshold:
                body.liquidityAlertThreshold === null
                  ? null
                  : body.liquidityAlertThreshold.toString(),
            }
          : {}),
      },
      select: userSelect,
    });

    return reply.send(serializeUser(user));
  });
};

export default authRoutes;
