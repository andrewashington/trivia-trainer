-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "context" JSONB,
ADD COLUMN     "severity" "FeedbackSeverity" NOT NULL DEFAULT 'medium';

