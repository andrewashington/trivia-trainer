-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "revealThreshold" INTEGER;

-- AlterTable
ALTER TABLE "RevealPrompt" ADD COLUMN     "unlockVotesNeeded" INTEGER;

-- CreateTable
CREATE TABLE "PollRevealVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollRevealVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevealUnlockVote" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevealUnlockVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PollRevealVote_pollId_userId_key" ON "PollRevealVote"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RevealUnlockVote_promptId_userId_key" ON "RevealUnlockVote"("promptId", "userId");

-- AddForeignKey
ALTER TABLE "PollRevealVote" ADD CONSTRAINT "PollRevealVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollRevealVote" ADD CONSTRAINT "PollRevealVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealUnlockVote" ADD CONSTRAINT "RevealUnlockVote_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "RevealPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealUnlockVote" ADD CONSTRAINT "RevealUnlockVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
