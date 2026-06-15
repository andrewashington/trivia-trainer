-- Assistant memory: durable user-taught facts + per-channel conversation turns.

CREATE TABLE "DiscordMemory" (
  "id" TEXT NOT NULL,
  "fact" TEXT NOT NULL,
  "subject" TEXT,
  "subjectUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscordMemory_active_createdAt_idx" ON "DiscordMemory"("active", "createdAt");

CREATE TABLE "DiscordTurn" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userText" TEXT NOT NULL,
  "assistantText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTurn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscordTurn_channelId_createdAt_idx" ON "DiscordTurn"("channelId", "createdAt");
