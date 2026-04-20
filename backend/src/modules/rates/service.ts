import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import { request } from "undici";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { Decimal, serializeDecimal, toPrismaDecimal } from "../../lib/decimal.js";

export const RATE_TYPES = ["blue", "oficial", "mep"] as const;
export type RateType = (typeof RATE_TYPES)[number];

const REDIS_KEY = (type: RateType) => `rate:${type}:current`;
const REDIS_TTL_SECONDS = 20 * 60; // 20 min (slightly above fetch interval)

type DolarApiResponse = {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
};

const endpointFor = (type: RateType): string => {
  const path = type === "oficial" ? "oficial" : type === "mep" ? "bolsa" : "blue";
  return `${env.DOLARAPI_BASE}/${path}`;
};

export const fetchFromDolarApi = async (type: RateType): Promise<DolarApiResponse> => {
  const res = await request(endpointFor(type), { method: "GET" });
  if (res.statusCode >= 400) {
    throw new Error(`dolarapi ${type} returned ${res.statusCode}`);
  }
  return (await res.body.json()) as DolarApiResponse;
};

// Midpoint of buy/sell is the conventional "rate" to use for accounting.
export const midpoint = (data: DolarApiResponse): string =>
  new Decimal(data.compra).plus(data.venta).div(2).toDecimalPlaces(4).toString();

export const refreshAllRates = async (
  prisma: PrismaClient,
  redis: Redis
): Promise<Record<RateType, string | null>> => {
  const result: Record<RateType, string | null> = { blue: null, oficial: null, mep: null };

  for (const type of RATE_TYPES) {
    try {
      const data = await fetchFromDolarApi(type);
      const rate = midpoint(data);
      const date = new Date(data.fechaActualizacion);

      await redis.set(
        REDIS_KEY(type),
        JSON.stringify({ rate, date: date.toISOString(), source: "dolarapi" }),
        "EX",
        REDIS_TTL_SECONDS
      );

      const dateOnly = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      );
      await prisma.exchangeRate.upsert({
        where: { date_rateType: { date: dateOnly, rateType: type } },
        update: { rate: toPrismaDecimal(rate), source: "dolarapi" },
        create: {
          date: dateOnly,
          rateType: type,
          rate: toPrismaDecimal(rate),
          source: "dolarapi",
        },
      });

      result[type] = rate;
    } catch (err) {
      logger.error({ err, type }, "failed to refresh exchange rate");
    }
  }
  return result;
};

export const getCurrentRate = async (
  prisma: PrismaClient,
  redis: Redis,
  type: RateType = "blue"
): Promise<string> => {
  const cached = await redis.get(REDIS_KEY(type));
  if (cached) {
    const parsed = JSON.parse(cached) as { rate: string };
    return parsed.rate;
  }
  const latest = await prisma.exchangeRate.findFirst({
    where: { rateType: type },
    orderBy: { date: "desc" },
  });
  if (latest) {
    return serializeDecimal(latest.rate) ?? "0";
  }
  // Last-resort: fetch live and persist.
  const data = await fetchFromDolarApi(type);
  return midpoint(data);
};

export const getAllCurrentRates = async (prisma: PrismaClient, redis: Redis) => {
  const out: Record<string, string> = {};
  for (const type of RATE_TYPES) {
    out[type] = await getCurrentRate(prisma, redis, type);
  }
  return out;
};
