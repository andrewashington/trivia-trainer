-- Per-channel assistant state. Holds the `/clear` watermark so the assistant's
-- ambient context (and get_more_messages) only consider messages sent AFTER a
-- reset — making /clear a true thread boundary for raw channel chatter, not
-- just the stored DiscordTurn history. Additive only.
CREATE TABLE "DiscordChannelState" (
    "channelId" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordChannelState_pkey" PRIMARY KEY ("channelId")
);
