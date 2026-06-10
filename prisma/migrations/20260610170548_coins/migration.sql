-- Coins: denormalized balance on User + append-only ledger.
ALTER TABLE "User" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoinTransaction_userId_reason_createdAt_idx"
    ON "CoinTransaction"("userId", "reason", "createdAt");

ALTER TABLE "CoinTransaction"
    ADD CONSTRAINT "CoinTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
