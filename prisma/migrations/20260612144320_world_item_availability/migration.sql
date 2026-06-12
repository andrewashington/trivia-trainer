-- Unobtainable items: exist + can be granted/owned/placed, but never sell.
-- Modeled as an availability flag (not a separate table) so ownership
-- (WorldOwnedItem → WorldItem) and the scan/seed/atlas pipeline stay single.
ALTER TABLE "WorldItem" ADD COLUMN "availability" TEXT NOT NULL DEFAULT 'shop';

-- shop query filters published + availability; widen the existing index.
DROP INDEX IF EXISTS "WorldItem_published_category_idx";
CREATE INDEX "WorldItem_published_availability_category_idx"
  ON "WorldItem"("published", "availability", "category");
