CREATE TABLE "TransactionGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE "TransactionGroupInvite" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionGroupInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransactionGroupMember_userId_idx" ON "TransactionGroupMember"("userId");

CREATE UNIQUE INDEX "TransactionGroupInvite_groupId_email_status_key" ON "TransactionGroupInvite"("groupId", "email", "status");
CREATE INDEX "TransactionGroupInvite_email_status_idx" ON "TransactionGroupInvite"("email", "status");
CREATE INDEX "TransactionGroupInvite_groupId_idx" ON "TransactionGroupInvite"("groupId");

ALTER TABLE "TransactionGroupMember" ADD CONSTRAINT "TransactionGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TransactionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionGroupMember" ADD CONSTRAINT "TransactionGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionGroupInvite" ADD CONSTRAINT "TransactionGroupInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TransactionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionGroupInvite" ADD CONSTRAINT "TransactionGroupInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TransactionGroupMember" ("groupId", "userId", "role", "createdAt")
SELECT "id", "userId", 'owner', "createdAt"
FROM "TransactionGroup"
ON CONFLICT ("groupId", "userId") DO NOTHING;
