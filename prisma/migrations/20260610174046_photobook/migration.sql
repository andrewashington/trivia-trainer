-- Photobook: gallery entries wrapping image FileObjects, plus member tags.
CREATE TABLE "PhotobookPhoto" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotobookPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotobookPhoto_fileId_key" ON "PhotobookPhoto"("fileId");
CREATE INDEX "PhotobookPhoto_createdAt_idx" ON "PhotobookPhoto"("createdAt");

ALTER TABLE "PhotobookPhoto" ADD CONSTRAINT "PhotobookPhoto_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotobookPhoto" ADD CONSTRAINT "PhotobookPhoto_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PhotobookTag" (
    "photoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PhotobookTag_pkey" PRIMARY KEY ("photoId","userId")
);

CREATE INDEX "PhotobookTag_userId_idx" ON "PhotobookTag"("userId");

ALTER TABLE "PhotobookTag" ADD CONSTRAINT "PhotobookTag_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "PhotobookPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotobookTag" ADD CONSTRAINT "PhotobookTag_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
