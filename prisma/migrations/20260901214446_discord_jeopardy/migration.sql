-- Jeopardy (Discord-only game): clue bank, live games, final results.
CREATE TABLE "jeopardy_clues" (
    "id" SERIAL NOT NULL,
    "airDate" DATE NOT NULL,
    "round" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "comments" TEXT,
    "clue" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "jeopardy_clues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jeopardy_clues_airDate_round_idx" ON "jeopardy_clues"("airDate", "round");
CREATE INDEX "jeopardy_clues_category_idx" ON "jeopardy_clues"("category");

CREATE TABLE "jeopardy_games" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "channelId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedByName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "jeopardy_games_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jeopardy_games_channelId_status_idx" ON "jeopardy_games"("channelId", "status");

CREATE TABLE "jeopardy_results" (
    "gameId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jeopardy_results_pkey" PRIMARY KEY ("gameId","discordUserId")
);

CREATE INDEX "jeopardy_results_discordUserId_idx" ON "jeopardy_results"("discordUserId");
