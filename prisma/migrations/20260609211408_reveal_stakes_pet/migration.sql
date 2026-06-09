-- CreateEnum
CREATE TYPE "RevealType" AS ENUM ('rank', 'sealed', 'oracle');

-- CreateEnum
CREATE TYPE "RevealStatus" AS ENUM ('open', 'revealed');

-- CreateEnum
CREATE TYPE "ClaimOutcome" AS ENUM ('right', 'wrong', 'void');

-- CreateTable
CREATE TABLE "RevealPrompt" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" "RevealType" NOT NULL,
    "title" TEXT NOT NULL,
    "items" JSONB,
    "scaleMax" INTEGER,
    "deadline" TIMESTAMP(3),
    "unlockAt" TIMESTAMP(3),
    "minSubmitters" INTEGER NOT NULL DEFAULT 3,
    "status" "RevealStatus" NOT NULL DEFAULT 'open',
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevealPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevealSubmission" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevealSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "counterpartyId" TEXT,
    "stake" TEXT,
    "outcome" "ClaimOutcome",
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Forfeit" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Forfeit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForfeitSpin" (
    "id" TEXT NOT NULL,
    "forfeitId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "spunById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForfeitSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Wiggle',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetNudge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetNudge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevealPrompt_status_createdAt_idx" ON "RevealPrompt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevealSubmission_promptId_userId_key" ON "RevealSubmission"("promptId", "userId");

-- CreateIndex
CREATE INDEX "Claim_resolvedAt_resolvesAt_idx" ON "Claim"("resolvedAt", "resolvesAt");

-- CreateIndex
CREATE INDEX "ForfeitSpin_createdAt_idx" ON "ForfeitSpin"("createdAt");

-- CreateIndex
CREATE INDEX "PetNudge_userId_createdAt_idx" ON "PetNudge"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RevealPrompt" ADD CONSTRAINT "RevealPrompt_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealSubmission" ADD CONSTRAINT "RevealSubmission_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "RevealPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealSubmission" ADD CONSTRAINT "RevealSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forfeit" ADD CONSTRAINT "Forfeit_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForfeitSpin" ADD CONSTRAINT "ForfeitSpin_forfeitId_fkey" FOREIGN KEY ("forfeitId") REFERENCES "Forfeit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForfeitSpin" ADD CONSTRAINT "ForfeitSpin_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForfeitSpin" ADD CONSTRAINT "ForfeitSpin_spunById_fkey" FOREIGN KEY ("spunById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetNudge" ADD CONSTRAINT "PetNudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
