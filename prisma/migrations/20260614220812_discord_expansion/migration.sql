-- CreateTable
CREATE TABLE "DiscordMessageRef" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordMessageRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordNotifyPref" (
    "userId" TEXT NOT NULL,
    "dmTurn" BOOLEAN NOT NULL DEFAULT true,
    "dmClaims" BOOLEAN NOT NULL DEFAULT true,
    "dmStakes" BOOLEAN NOT NULL DEFAULT true,
    "dmMentions" BOOLEAN NOT NULL DEFAULT true,
    "dmDigest" BOOLEAN NOT NULL DEFAULT false,
    "digestDaily" BOOLEAN NOT NULL DEFAULT false,
    "dmChannelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordNotifyPref_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DiscordDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "DiscordDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordDrop" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'first',
    "maxClaims" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordDrop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordDropClaim" (
    "dropId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordDropClaim_pkey" PRIMARY KEY ("dropId","userId")
);

-- CreateTable
CREATE TABLE "DiscordCoinflip" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT,
    "ante" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "winnerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordCoinflip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordMessageRef_messageId_idx" ON "DiscordMessageRef"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordMessageRef_kind_refId_key" ON "DiscordMessageRef"("kind", "refId");

-- CreateIndex
CREATE INDEX "DiscordDraft_userId_createdAt_idx" ON "DiscordDraft"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiscordDropClaim" ADD CONSTRAINT "DiscordDropClaim_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "DiscordDrop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
