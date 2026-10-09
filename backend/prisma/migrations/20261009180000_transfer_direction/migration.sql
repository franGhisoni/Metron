CREATE TYPE "TransferDirection" AS ENUM ('out', 'in');

ALTER TABLE "Transaction" ADD COLUMN "transferDirection" "TransferDirection";
