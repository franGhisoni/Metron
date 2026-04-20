import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AccessTokenPayload = { sub: string; email: string };
export type RefreshTokenPayload = { sub: string; jti: string };

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    signAccessToken: (payload: AccessTokenPayload) => string;
    signRefreshToken: (payload: RefreshTokenPayload) => string;
    verifyRefreshToken: (token: string) => RefreshTokenPayload;
  }
  interface FastifyRequest {
    userId: string;
  }
}

export default fp(async (app: FastifyInstance) => {
  // Access tokens only — @fastify/jwt powers request.jwtVerify() on protected routes.
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: `${env.JWT_ACCESS_TTL_MIN}m` },
  });

  // Refresh tokens are signed/verified directly with jsonwebtoken to keep a clean
  // separation from the access-token secret and avoid @fastify/jwt namespace quirks.
  app.decorate("signAccessToken", (payload: AccessTokenPayload): string =>
    app.jwt.sign(payload as unknown as Record<string, unknown>)
  );

  app.decorate("signRefreshToken", (payload: RefreshTokenPayload): string =>
    jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
    })
  );

  app.decorate("verifyRefreshToken", (token: string): RefreshTokenPayload => {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof decoded === "string") throw new Error("invalid_token");
    return decoded as RefreshTokenPayload;
  });

  app.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const decoded = await req.jwtVerify<AccessTokenPayload>();
        req.userId = decoded.sub;
      } catch {
        reply.code(401).send({ error: "unauthorized" });
      }
    }
  );
});
