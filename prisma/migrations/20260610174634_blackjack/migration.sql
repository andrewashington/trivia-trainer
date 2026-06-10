-- Blackjack: server-authoritative single-player hands wagering coins.
-- The shoe + both hands live in `state` (JSON) so the client can't peek.
CREATE TABLE "BlackjackHand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bet" INTEGER NOT NULL,
    "doubled" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "payout" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "BlackjackHand_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BlackjackHand"
    ADD CONSTRAINT "BlackjackHand_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "BlackjackHand_userId_status_idx" ON "BlackjackHand"("userId", "status");
CREATE INDEX "BlackjackHand_userId_createdAt_idx" ON "BlackjackHand"("userId", "createdAt");
