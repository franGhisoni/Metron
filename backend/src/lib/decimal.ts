import { Prisma } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import Decimal from "decimal.js";

export { Decimal };

export const ROUND_HALF_UP = Decimal.ROUND_HALF_UP ?? 4;

export const toDecimal = (v: string | number | Prisma.Decimal | Decimal): Decimal => {
  if (v instanceof Decimal) return v;
  return new Decimal(v.toString());
};

export const toPrismaDecimal = (v: string | number | Decimal): Prisma.Decimal => {
  return new Prisma.Decimal(v.toString());
};

export const serializeDecimal = (
  v: Prisma.Decimal | Decimal | null | undefined
): string | null => {
  if (v === null || v === undefined) return null;
  return v.toString();
};
