-- Per-Discord-user uwu-ify toggle (level 1–3) plus cached per-channel
-- webhooks used to delete+repost transformed messages as the author.
-- Additive only.

CREATE TABLE "DiscordUwuTarget" (
    "discordUserId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "enabledByDiscordUserId" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordUwuTarget_pkey" PRIMARY KEY ("discordUserId")
);

ALTER TABLE "DiscordChannelState" ADD COLUMN "uwuWebhookId" TEXT;
ALTER TABLE "DiscordChannelState" ADD COLUMN "uwuWebhookToken" TEXT;
