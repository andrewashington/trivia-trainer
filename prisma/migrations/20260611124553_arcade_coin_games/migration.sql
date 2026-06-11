-- CreateTable
CREATE TABLE "ArcadeRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT NOT NULL,
    "net" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArcadeRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinesGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "mineCount" INTEGER NOT NULL,
    "mines" INTEGER[],
    "revealed" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "MinesGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "crashPoint" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cashoutMultiplier" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CrashRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArcadeRound_game_net_idx" ON "ArcadeRound"("game", "net");

-- CreateIndex
CREATE INDEX "ArcadeRound_game_multiplier_idx" ON "ArcadeRound"("game", "multiplier");

-- CreateIndex
CREATE INDEX "ArcadeRound_userId_createdAt_idx" ON "ArcadeRound"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MinesGame_userId_status_idx" ON "MinesGame"("userId", "status");

-- CreateIndex
CREATE INDEX "CrashRound_userId_status_idx" ON "CrashRound"("userId", "status");

-- AddForeignKey
ALTER TABLE "ArcadeRound" ADD CONSTRAINT "ArcadeRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinesGame" ADD CONSTRAINT "MinesGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashRound" ADD CONSTRAINT "CrashRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
