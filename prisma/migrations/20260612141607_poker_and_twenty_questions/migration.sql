-- Poker (async Texas Hold'em cash tables, zero-sum) + 20 Questions (async
-- group guessing). Additive only.

-- ============ Poker ============

CREATE TABLE "PokerTable" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "smallBlind" INTEGER NOT NULL DEFAULT 1,
  "bigBlind" INTEGER NOT NULL DEFAULT 2,
  "clockHours" INTEGER NOT NULL DEFAULT 24,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PokerTable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PokerTable_status_createdAt_idx" ON "PokerTable"("status", "createdAt");

CREATE TABLE "PokerSeat" (
  "id" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seatIndex" INTEGER NOT NULL,
  "stack" INTEGER NOT NULL,
  "sittingOut" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PokerSeat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PokerSeat_tableId_userId_key" ON "PokerSeat"("tableId", "userId");
CREATE UNIQUE INDEX "PokerSeat_tableId_seatIndex_key" ON "PokerSeat"("tableId", "seatIndex");
CREATE INDEX "PokerSeat_tableId_idx" ON "PokerSeat"("tableId");

CREATE TABLE "PokerHand" (
  "id" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "handNumber" INTEGER NOT NULL,
  "buttonSeat" INTEGER NOT NULL,
  "deck" JSONB NOT NULL,
  "board" JSONB NOT NULL DEFAULT '[]',
  "pot" INTEGER NOT NULL DEFAULT 0,
  "state" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'betting',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "PokerHand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PokerHand_tableId_handNumber_key" ON "PokerHand"("tableId", "handNumber");
CREATE INDEX "PokerHand_tableId_status_idx" ON "PokerHand"("tableId", "status");

CREATE TABLE "PokerHandSeat" (
  "id" TEXT NOT NULL,
  "handId" TEXT NOT NULL,
  "seatIndex" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "hole" JSONB NOT NULL,
  "startingStack" INTEGER NOT NULL,
  "committed" INTEGER NOT NULL DEFAULT 0,
  "streetCommit" INTEGER NOT NULL DEFAULT 0,
  "folded" BOOLEAN NOT NULL DEFAULT false,
  "allIn" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "PokerHandSeat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PokerHandSeat_handId_seatIndex_key" ON "PokerHandSeat"("handId", "seatIndex");
CREATE INDEX "PokerHandSeat_handId_idx" ON "PokerHandSeat"("handId");

CREATE TABLE "PokerAction" (
  "id" TEXT NOT NULL,
  "handId" TEXT NOT NULL,
  "seatIndex" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PokerAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PokerAction_handId_createdAt_idx" ON "PokerAction"("handId", "createdAt");

ALTER TABLE "PokerSeat"
  ADD CONSTRAINT "PokerSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PokerSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PokerHand"
  ADD CONSTRAINT "PokerHand_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PokerHandSeat"
  ADD CONSTRAINT "PokerHandSeat_handId_fkey" FOREIGN KEY ("handId") REFERENCES "PokerHand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PokerAction"
  ADD CONSTRAINT "PokerAction_handId_fkey" FOREIGN KEY ("handId") REFERENCES "PokerHand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ 20 Questions ============

CREATE TABLE "TwentyQuestionsGame" (
  "id" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "winnerId" TEXT,
  "answered" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),

  CONSTRAINT "TwentyQuestionsGame_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TwentyQuestionsGame_status_createdAt_idx" ON "TwentyQuestionsGame"("status", "createdAt");

CREATE TABLE "TwentyQuestionsEntry" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "askerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "answer" TEXT,
  "correct" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TwentyQuestionsEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TwentyQuestionsEntry_gameId_createdAt_idx" ON "TwentyQuestionsEntry"("gameId", "createdAt");

ALTER TABLE "TwentyQuestionsGame"
  ADD CONSTRAINT "TwentyQuestionsGame_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TwentyQuestionsGame_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TwentyQuestionsEntry"
  ADD CONSTRAINT "TwentyQuestionsEntry_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TwentyQuestionsGame"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TwentyQuestionsEntry_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
