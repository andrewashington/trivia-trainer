-- Tiermaker: group tier lists. Items are shared per list; placements
-- are per-user (everyone ranks the same items independently).

CREATE TABLE "TierList" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TierList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TierItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TierItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TierPlacement" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierPlacement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TierItem_listId_idx" ON "TierItem"("listId");
CREATE UNIQUE INDEX "TierPlacement_itemId_userId_key" ON "TierPlacement"("itemId", "userId");
CREATE INDEX "TierPlacement_listId_userId_idx" ON "TierPlacement"("listId", "userId");

ALTER TABLE "TierList" ADD CONSTRAINT "TierList_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TierItem" ADD CONSTRAINT "TierItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TierList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TierPlacement" ADD CONSTRAINT "TierPlacement_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TierList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TierPlacement" ADD CONSTRAINT "TierPlacement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TierItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TierPlacement" ADD CONSTRAINT "TierPlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
