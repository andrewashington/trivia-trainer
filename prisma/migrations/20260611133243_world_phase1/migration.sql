-- The World, Phase 1: item catalog, inventory, houses (docs/world-design.md)

-- CreateTable
CREATE TABLE "WorldItem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "spriteKey" TEXT NOT NULL,
    "tileW" INTEGER NOT NULL DEFAULT 1,
    "tileH" INTEGER NOT NULL DEFAULT 1,
    "surface" TEXT NOT NULL DEFAULT 'floor',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldOwnedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "x" INTEGER,
    "y" INTEGER,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldOwnedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHouse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "plot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldHouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldItem_key_key" ON "WorldItem"("key");
CREATE INDEX "WorldItem_published_category_idx" ON "WorldItem"("published", "category");
CREATE INDEX "WorldOwnedItem_userId_idx" ON "WorldOwnedItem"("userId");
CREATE UNIQUE INDEX "WorldHouse_userId_key" ON "WorldHouse"("userId");
CREATE UNIQUE INDEX "WorldHouse_plot_key" ON "WorldHouse"("plot");

-- AddForeignKey
ALTER TABLE "WorldOwnedItem" ADD CONSTRAINT "WorldOwnedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorldOwnedItem" ADD CONSTRAINT "WorldOwnedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorldItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorldHouse" ADD CONSTRAINT "WorldHouse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
