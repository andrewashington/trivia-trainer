-- Oracle reveal type removed; anonymous scale polls cover the use case.
DELETE FROM "RevealPrompt" WHERE "type" = 'oracle';

ALTER TYPE "RevealType" RENAME TO "RevealType_old";
CREATE TYPE "RevealType" AS ENUM ('rank', 'sealed');
ALTER TABLE "RevealPrompt" ALTER COLUMN "type" TYPE "RevealType" USING ("type"::text::"RevealType");
DROP TYPE "RevealType_old";

ALTER TABLE "RevealPrompt" DROP COLUMN "scaleMax";
