-- Discord bot phase 1: short-lived codes minted by the /link slash command,
-- redeemed on /me to set User.discordUserId. Additive only.

CREATE TABLE "DiscordLinkCode" (
    "code" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLinkCode_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "DiscordLinkCode_discordUserId_idx" ON "DiscordLinkCode"("discordUserId");
