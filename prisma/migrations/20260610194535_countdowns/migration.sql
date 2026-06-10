-- CreateTable
CREATE TABLE "Countdown" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "emoji" TEXT,
    "targetAt" TIMESTAMP(3) NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Countdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Countdown_targetAt_idx" ON "Countdown"("targetAt");

-- AddForeignKey
ALTER TABLE "Countdown" ADD CONSTRAINT "Countdown_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
