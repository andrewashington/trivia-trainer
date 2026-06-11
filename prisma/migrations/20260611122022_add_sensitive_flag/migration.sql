-- AlterTable
ALTER TABLE "Poll" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TierList" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PhotobookPhoto" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;
