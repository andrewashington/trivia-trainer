-- Keyed JSON game-data overrides, edited in /world/admin
CREATE TABLE "WorldConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldConfig_pkey" PRIMARY KEY ("key")
);
