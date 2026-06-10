-- Extra digs: the one-dig-per-day rule moves to the route (free first dig,
-- paid extras), so the unique constraint becomes a plain index.
DROP INDEX "TreasureDig_day_userId_key";
CREATE INDEX "TreasureDig_day_userId_idx" ON "TreasureDig"("day", "userId");
