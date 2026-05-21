ALTER TABLE "Investment"
ADD COLUMN "currentPriceUsd" DECIMAL(65,30),
ADD COLUMN "currentPriceArs" DECIMAL(65,30),
ADD COLUMN "lastPriceUpdatedAt" TIMESTAMP(3);
