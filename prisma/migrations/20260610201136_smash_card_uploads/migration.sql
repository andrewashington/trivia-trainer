-- Smash cards: uploaded images live in the bucket, referenced by key
ALTER TABLE "SmashCard" ADD COLUMN "storageKey" TEXT;
