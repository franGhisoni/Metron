import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export { Decimal };

export const toDecimal = (v: string | number | Prisma.Decimal | Decimal): Decimal => {
  if (v instanceof Decimal) return v;
  return new Decimal(v.toString());
};

export const toPrismaDecimal = (v: string | number | Decimal): Prisma.Decimal => {
  return new Prisma.Decimal(v.toString());
};

// Serialize Prisma.Decimal / decimal.js to string for JSON responses so the
// frontend never sees a float. Shape must match what the frontend expects.
export const serializeDecimal = (v: Prisma.Decimal | Decimal | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  return v.toString();
};
