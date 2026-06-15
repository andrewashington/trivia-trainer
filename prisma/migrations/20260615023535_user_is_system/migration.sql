-- The bot's own user account flag (UDM+), so bot-made content is attributable.
ALTER TABLE "User" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
