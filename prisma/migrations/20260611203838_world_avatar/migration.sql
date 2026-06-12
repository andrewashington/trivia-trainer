-- World character avatar: chosen generator parts per user
CREATE TABLE "WorldAvatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldAvatar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorldAvatar_userId_key" ON "WorldAvatar"("userId");

ALTER TABLE "WorldAvatar" ADD CONSTRAINT "WorldAvatar_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
