-- Presence: heartbeat timestamp on User
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- Comments: one polymorphic thread table
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_targetType_targetId_createdAt_idx" ON "Comment"("targetType", "targetId", "createdAt");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Buried Treasure: one day row + one dig per user per day
CREATE TABLE "TreasureDay" (
    "day" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "pot" INTEGER NOT NULL,
    "foundById" TEXT,
    "foundAt" TIMESTAMP(3),

    CONSTRAINT "TreasureDay_pkey" PRIMARY KEY ("day")
);

CREATE TABLE "TreasureDig" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasureDig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreasureDig_day_userId_key" ON "TreasureDig"("day", "userId");
CREATE INDEX "TreasureDig_day_idx" ON "TreasureDig"("day");

ALTER TABLE "TreasureDay" ADD CONSTRAINT "TreasureDay_foundById_fkey" FOREIGN KEY ("foundById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreasureDig" ADD CONSTRAINT "TreasureDig_day_fkey" FOREIGN KEY ("day") REFERENCES "TreasureDay"("day") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreasureDig" ADD CONSTRAINT "TreasureDig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
