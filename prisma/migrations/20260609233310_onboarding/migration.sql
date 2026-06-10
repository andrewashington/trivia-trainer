-- AlterTable
ALTER TABLE "User" ADD COLUMN     "introsSeen" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "onboardedAt" TIMESTAMP(3);
