-- Cool Finds: shared useful/funny/interesting links (a tab in the wishlist).
CREATE TABLE "CoolFind" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'interesting',
  "note" TEXT,
  "imageUrl" TEXT,
  "siteName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoolFind_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoolFind_category_createdAt_idx" ON "CoolFind"("category", "createdAt");

ALTER TABLE "CoolFind" ADD CONSTRAINT "CoolFind_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
