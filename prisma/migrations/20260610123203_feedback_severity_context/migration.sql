-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('low', 'medium', 'high');

-- AlterTable
-- NOTE: this migration's folder timestamp (1232) predates the one that
-- creates "Feedback" (1417) even though it was *applied* after it, so a
-- from-scratch replay (shadow DB, fresh deploys) runs it first. Guarded
-- so it no-ops in that case; 20260610141734_feedback then creates the
-- table with these columns included.
DO $$
BEGIN
  IF to_regclass('"Feedback"') IS NOT NULL THEN
    ALTER TABLE "Feedback" ADD COLUMN "context" JSONB,
    ADD COLUMN "severity" "FeedbackSeverity" NOT NULL DEFAULT 'medium';
  END IF;
END $$;
