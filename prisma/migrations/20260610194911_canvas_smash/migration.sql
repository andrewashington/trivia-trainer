-- Infinite Canvas: append-only strokes
CREATE TABLE "CanvasStroke" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL DEFAULT 'pen',
    "color" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "points" JSONB NOT NULL,
    "stamp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasStroke_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CanvasStroke_createdAt_idx" ON "CanvasStroke"("createdAt");
ALTER TABLE "CanvasStroke" ADD CONSTRAINT "CanvasStroke_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Smash or Pass: decks, cards, verdicts
CREATE TABLE "SmashDeck" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmashDeck_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SmashDeck" ADD CONSTRAINT "SmashDeck_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SmashCard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SmashCard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SmashCard_deckId_idx" ON "SmashCard"("deckId");
ALTER TABLE "SmashCard" ADD CONSTRAINT "SmashCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "SmashDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SmashVote" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmashVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmashVote_cardId_userId_key" ON "SmashVote"("cardId", "userId");
ALTER TABLE "SmashVote" ADD CONSTRAINT "SmashVote_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "SmashCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmashVote" ADD CONSTRAINT "SmashVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
