-- The Book: play-money bets on public Polymarket markets.
-- Additive only: cached market metadata plus user bet positions.

CREATE TABLE "BookMarket" (
    "id" TEXT NOT NULL,
    "polymarketId" TEXT NOT NULL,
    "slug" TEXT,
    "question" TEXT NOT NULL,
    "category" TEXT,
    "image" TEXT,
    "outcomes" JSONB NOT NULL,
    "outcomePrices" JSONB NOT NULL,
    "conditionId" TEXT,
    "clobTokenIds" JSONB,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "resolvedOutcome" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookMarket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookBet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "potentialPayout" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookBet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookMarket_polymarketId_key" ON "BookMarket"("polymarketId");
CREATE UNIQUE INDEX "BookMarket_slug_key" ON "BookMarket"("slug");
CREATE INDEX "BookMarket_active_closed_endDate_idx" ON "BookMarket"("active", "closed", "endDate");
CREATE INDEX "BookMarket_lastSyncedAt_idx" ON "BookMarket"("lastSyncedAt");
CREATE INDEX "BookBet_userId_status_createdAt_idx" ON "BookBet"("userId", "status", "createdAt");
CREATE INDEX "BookBet_marketId_status_idx" ON "BookBet"("marketId", "status");

ALTER TABLE "BookBet" ADD CONSTRAINT "BookBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookBet" ADD CONSTRAINT "BookBet_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "BookMarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
