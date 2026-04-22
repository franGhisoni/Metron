-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "recurringParentId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_recurringParentId_idx" ON "Transaction"("recurringParentId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringParentId_fkey" FOREIGN KEY ("recurringParentId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
