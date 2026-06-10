-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN "fixtureId" TEXT,
ADD COLUMN "pickTeam" TEXT;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
