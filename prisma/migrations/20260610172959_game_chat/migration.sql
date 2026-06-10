-- Game chat: smack talk + crowd chat alongside games. Channel-scoped
-- ("tanks:<gameId>") so any game can reuse the same table.
CREATE TABLE "GameChatMessage" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameChatMessage_channel_createdAt_idx"
    ON "GameChatMessage"("channel", "createdAt");

ALTER TABLE "GameChatMessage"
    ADD CONSTRAINT "GameChatMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
