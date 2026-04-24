-- CreateTable
CREATE TABLE "TransactionGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionGroupAssignment" (
    "transactionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionGroupAssignment_pkey" PRIMARY KEY ("transactionId","groupId")
);

-- CreateIndex
CREATE INDEX "TransactionGroup_userId_idx" ON "TransactionGroup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionGroup_userId_name_key" ON "TransactionGroup"("userId", "name");

-- CreateIndex
CREATE INDEX "TransactionGroupAssignment_groupId_idx" ON "TransactionGroupAssignment"("groupId");

-- AddForeignKey
ALTER TABLE "TransactionGroup" ADD CONSTRAINT "TransactionGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionGroupAssignment" ADD CONSTRAINT "TransactionGroupAssignment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionGroupAssignment" ADD CONSTRAINT "TransactionGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TransactionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
