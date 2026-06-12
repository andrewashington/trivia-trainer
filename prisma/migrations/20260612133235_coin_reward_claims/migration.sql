-- App-wide claimable coin drops. One row per user per campaign key keeps
-- each free reward idempotent while CoinTransaction remains the ledger.
CREATE TABLE "CoinRewardClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rewardKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoinRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoinRewardClaim_userId_rewardKey_key" ON "CoinRewardClaim"("userId", "rewardKey");
CREATE INDEX "CoinRewardClaim_rewardKey_createdAt_idx" ON "CoinRewardClaim"("rewardKey", "createdAt");

ALTER TABLE "CoinRewardClaim"
  ADD CONSTRAINT "CoinRewardClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
