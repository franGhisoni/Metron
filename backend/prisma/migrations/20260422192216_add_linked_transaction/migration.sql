-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "linkedTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_linkedTransactionId_idx" ON "Transaction"("linkedTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_linkedTransactionId_fkey" FOREIGN KEY ("linkedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
