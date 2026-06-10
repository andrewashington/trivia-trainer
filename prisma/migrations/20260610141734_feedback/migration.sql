-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('bug', 'idea', 'praise');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL DEFAULT 'bug',
    "message" TEXT NOT NULL,
    "userAgent" TEXT,
    -- severity/context belong to 20260610123203 (misdated folder name:
    -- applied later in prod, replayed earlier from scratch — see its guard).
    "severity" "FeedbackSeverity" NOT NULL DEFAULT 'medium',
    "context" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_resolvedAt_createdAt_idx" ON "Feedback"("resolvedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
