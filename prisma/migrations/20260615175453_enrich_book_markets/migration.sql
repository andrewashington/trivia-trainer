-- Cache richer free Polymarket metadata so The Book is easier to browse.

ALTER TABLE "BookMarket" ADD COLUMN "eventTitle" TEXT;
ALTER TABLE "BookMarket" ADD COLUMN "description" TEXT;
ALTER TABLE "BookMarket" ADD COLUMN "tags" JSONB;
ALTER TABLE "BookMarket" ADD COLUMN "volume" DOUBLE PRECISION;
ALTER TABLE "BookMarket" ADD COLUMN "volume24hr" DOUBLE PRECISION;
ALTER TABLE "BookMarket" ADD COLUMN "liquidity" DOUBLE PRECISION;
ALTER TABLE "BookMarket" ADD COLUMN "spread" DOUBLE PRECISION;

CREATE INDEX "BookMarket_category_idx" ON "BookMarket"("category");
CREATE INDEX "BookMarket_volume24hr_idx" ON "BookMarket"("volume24hr");
CREATE INDEX "BookMarket_liquidity_idx" ON "BookMarket"("liquidity");
