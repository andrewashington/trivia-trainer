-- Type trainer. Additive only. Bare userId columns (no FK to User).

CREATE TABLE "TypingProfile" (
    "userId" TEXT NOT NULL,
    "placementCompletedAt" TIMESTAMP(3),
    "lastPlacementWpm" DOUBLE PRECISION,
    "lastPlacementAccuracy" DOUBLE PRECISION,
    "bestStandardWpm" DOUBLE PRECISION,
    "bestStandardAccuracy" DOUBLE PRECISION,
    "bestStandardSessionId" TEXT,
    "workoutStreak" INTEGER NOT NULL DEFAULT 0,
    "lastWorkoutDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "TypingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "durationSec" INTEGER,
    "wordCount" INTEGER,
    "punctuation" BOOLEAN NOT NULL DEFAULT false,
    "numbers" BOOLEAN NOT NULL DEFAULT false,
    "targetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rated" BOOLEAN NOT NULL DEFAULT false,
    "dailyDate" TEXT,
    "quoteId" TEXT,
    "workoutId" TEXT,
    "pieceId" TEXT,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "seed" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "rawWpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "correctChars" INTEGER NOT NULL,
    "incorrectChars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TypingSession_userId_createdAt_idx" ON "TypingSession"("userId", "createdAt");
CREATE INDEX "TypingSession_kind_rated_wpm_idx" ON "TypingSession"("kind", "rated", "wpm");
CREATE INDEX "TypingSession_dailyDate_official_wpm_idx" ON "TypingSession"("dailyDate", "official", "wpm");

CREATE TABLE "TypingKeyStat" (
    "userId" TEXT NOT NULL,
    "grapheme" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "latencyEmaMs" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "wasWeakAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingKeyStat_pkey" PRIMARY KEY ("userId","grapheme")
);

CREATE TABLE "TypingWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingWorkout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TypingWorkout_userId_date_key" ON "TypingWorkout"("userId", "date");

CREATE TABLE "TypingDaily" (
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "words" JSONB,
    "quoteId" TEXT,

    CONSTRAINT "TypingDaily_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "TypingDailyResult" (
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingDailyResult_pkey" PRIMARY KEY ("userId","date")
);

CREATE INDEX "TypingDailyResult_date_wpm_idx" ON "TypingDailyResult"("date", "wpm");

CREATE TABLE "TypingBadge" (
    "userId" TEXT NOT NULL,
    "badgeKey" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypingBadge_pkey" PRIMARY KEY ("userId","badgeKey")
);
