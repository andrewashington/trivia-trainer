-- Per-invocation trace of the Discord assistant brain, surfaced in the admin
-- Assistant tab for troubleshooting. Additive only.
CREATE TABLE "DiscordAssistantRun" (
    "id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "userId" TEXT,
    "channelId" TEXT,
    "prompt" TEXT NOT NULL,
    "modelRequest" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "fellBack" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "reply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordAssistantRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscordAssistantRun_createdAt_idx" ON "DiscordAssistantRun"("createdAt");
