import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "../categories/defaults.js";
import { env } from "../../config/env.js";

const REFRESH_TTL_MS = () => env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const hashRefreshToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const createDefaultCategoriesForUser = async (prisma: PrismaClient, userId: string) => {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
    })),
  });
};

export const persistRefreshToken = async (
  prisma: PrismaClient,
  userId: string,
  token: string,
  jti: string
) => {
  const tokenHash = hashRefreshToken(token);
  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS()),
    },
  });
};

export const rotateRefreshToken = async (
  prisma: PrismaClient,
  jti: string,
  incomingToken: string
) => {
  const tokenHash = hashRefreshToken(incomingToken);
  const record = await prisma.refreshToken.findUnique({ where: { id: jti } });
  if (!record || record.tokenHash !== tokenHash) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  await prisma.refreshToken.update({
    where: { id: jti },
    data: { revokedAt: new Date() },
  });
  return record;
};

export const revokeAllUserRefreshTokens = async (prisma: PrismaClient, userId: string) => {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const revokeRefreshToken = async (prisma: PrismaClient, jti: string) => {
  await prisma.refreshToken
    .update({ where: { id: jti }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
};

export const refreshCookieOptions = () => ({
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/api/auth",
  maxAge: Math.floor(REFRESH_TTL_MS() / 1000),
  signed: true as const,
});
