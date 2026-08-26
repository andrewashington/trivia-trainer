-- Per-Discord-user Oxford-comma enforcement toggle.
-- Additive only. Reuses the existing per-channel uwu webhook for impersonation.

CREATE TABLE "DiscordOxfordTarget" (
    "discordUserId" TEXT NOT NULL,
    "enabledByDiscordUserId" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordOxfordTarget_pkey" PRIMARY KEY ("discordUserId")
);
