-- The Key: a curve can bend on two axes at once (up AND left), so the
-- single direction field becomes vertical + lateral. The table has
-- never shipped, so the rename is safe.
ALTER TABLE "KeySubmission" RENAME COLUMN "curveDirection" TO "curveVertical";
ALTER TABLE "KeySubmission" ADD COLUMN "curveLateral" TEXT;
