-- Per-Discord-user chandler-mode toggle (l → r).
-- Additive only. Reuses the existing per-channel uwu webhook for impersonation.

CREATE TABLE "DiscordChandlerTarget" (
    "discordUserId" TEXT NOT NULL,
    "enabledByDiscordUserId" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordChandlerTarget_pkey" PRIMARY KEY ("discordUserId")
);
