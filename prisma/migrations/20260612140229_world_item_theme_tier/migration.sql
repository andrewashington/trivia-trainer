-- Furniture catalog future-proofing: theme (automatic, stable pack folder)
-- kept distinct from category (functional shop grouping), and a price tier
-- that drives default pricing. Both additive + nullable; existing rows
-- (none in prod yet) are unaffected.
ALTER TABLE "WorldItem" ADD COLUMN "theme" TEXT;
ALTER TABLE "WorldItem" ADD COLUMN "tier" TEXT;

CREATE INDEX "WorldItem_theme_idx" ON "WorldItem"("theme");
