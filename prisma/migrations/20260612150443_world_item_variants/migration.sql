-- Variant grouping + flavor copy for the furniture catalog. variantGroup
-- ties colorways/materials of one object together (shop shows a single entry
-- with a variant picker); variant is this colorway's label ("Oak"/"Sage");
-- tagline is ironic shop copy. All additive + nullable.
ALTER TABLE "WorldItem" ADD COLUMN "variantGroup" TEXT;
ALTER TABLE "WorldItem" ADD COLUMN "variant" TEXT;
ALTER TABLE "WorldItem" ADD COLUMN "tagline" TEXT;

CREATE INDEX "WorldItem_variantGroup_idx" ON "WorldItem"("variantGroup");
