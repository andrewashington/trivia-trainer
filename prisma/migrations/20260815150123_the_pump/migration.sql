-- The Pump: shared workout programs, adoptions ("run it"), session logs, PRs.
-- Additive only. Bare userId columns (no FK to User) per the parallel-session
-- convention; plan-child tables cascade/set-null against FitnessPlan.

CREATE TABLE "FitnessPlan" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT,
    "goal" TEXT,
    "daysPerWeek" INTEGER,
    "equipment" TEXT,
    "doc" JSONB NOT NULL,
    "sourceText" TEXT,
    "sourceUrl" TEXT,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "forkedFromId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitnessPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FitnessAdoption" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitnessAdoption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FitnessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "dayIndex" INTEGER,
    "dayName" TEXT,
    "note" TEXT,
    "durationMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitnessLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FitnessPr" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lift" TEXT NOT NULL,
    "liftKey" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'lb',
    "e1rm" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitnessPr_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FitnessPlan_createdAt_idx" ON "FitnessPlan"("createdAt");
CREATE UNIQUE INDEX "FitnessAdoption_planId_userId_key" ON "FitnessAdoption"("planId", "userId");
CREATE INDEX "FitnessAdoption_userId_idx" ON "FitnessAdoption"("userId");
CREATE INDEX "FitnessLog_userId_createdAt_idx" ON "FitnessLog"("userId", "createdAt");
CREATE INDEX "FitnessLog_createdAt_idx" ON "FitnessLog"("createdAt");
CREATE INDEX "FitnessPr_liftKey_e1rm_idx" ON "FitnessPr"("liftKey", "e1rm");
CREATE INDEX "FitnessPr_userId_liftKey_createdAt_idx" ON "FitnessPr"("userId", "liftKey", "createdAt");

ALTER TABLE "FitnessAdoption" ADD CONSTRAINT "FitnessAdoption_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FitnessPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitnessLog" ADD CONSTRAINT "FitnessLog_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FitnessPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
