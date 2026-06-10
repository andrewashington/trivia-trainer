-- CreateTable
CREATE TABLE "ArcadeScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArcadeScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArcadeScore_game_score_idx" ON "ArcadeScore"("game", "score");

-- CreateIndex
CREATE INDEX "ArcadeScore_game_userId_score_idx" ON "ArcadeScore"("game", "userId", "score");

-- AddForeignKey
ALTER TABLE "ArcadeScore" ADD CONSTRAINT "ArcadeScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

