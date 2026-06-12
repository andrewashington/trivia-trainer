-- Avatar cosmetics ownership (catalog lives in code)
CREATE TABLE "WorldOwnedCosmetic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldOwnedCosmetic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorldOwnedCosmetic_userId_kind_itemKey_key" ON "WorldOwnedCosmetic"("userId", "kind", "itemKey");

ALTER TABLE "WorldOwnedCosmetic" ADD CONSTRAINT "WorldOwnedCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
