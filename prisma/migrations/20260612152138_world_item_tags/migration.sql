-- Freeform tags (material/color/style/vibe) for search + filtering. One
-- flexible array means future filter facets are derivable without re-running
-- the catalog pass. GIN index makes `tags @> '{...}'` queries fast.
ALTER TABLE "WorldItem" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX "WorldItem_tags_idx" ON "WorldItem" USING GIN ("tags");
