-- CreateTable
CREATE TABLE "TanksGame" (
    "id" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "currentPlayerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "winnerId" TEXT,
    "challengerHp" INTEGER NOT NULL DEFAULT 100,
    "opponentHp" INTEGER NOT NULL DEFAULT 100,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TanksGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TanksTurn" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "weapon" TEXT NOT NULL,
    "angle" DOUBLE PRECISION NOT NULL,
    "power" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TanksTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TanksGame_status_updatedAt_idx" ON "TanksGame"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TanksGame_currentPlayerId_status_idx" ON "TanksGame"("currentPlayerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TanksTurn_gameId_index_key" ON "TanksTurn"("gameId", "index");

-- AddForeignKey
ALTER TABLE "TanksGame" ADD CONSTRAINT "TanksGame_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TanksGame" ADD CONSTRAINT "TanksGame_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TanksGame" ADD CONSTRAINT "TanksGame_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TanksTurn" ADD CONSTRAINT "TanksTurn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TanksGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TanksTurn" ADD CONSTRAINT "TanksTurn_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

