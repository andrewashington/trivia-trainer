-- The Key: one self-reported anatomy card per member (hidden module).
CREATE TABLE "KeySubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitPreference" TEXT NOT NULL DEFAULT 'imperial',
    "lengthMm" INTEGER,
    "girthMm" INTEGER,
    "glansShape" TEXT,
    "shaftProfile" TEXT,
    "foreskinStatus" TEXT,
    "pubicHair" TEXT,
    "veinVisibility" TEXT,
    "curveDirection" TEXT,
    "curveIntensity" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'concealed',
    "archetypeId" TEXT,
    "archetypeLabel" TEXT,
    "archetypeBlurb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeySubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KeySubmission_userId_key" ON "KeySubmission"("userId");

ALTER TABLE "KeySubmission" ADD CONSTRAINT "KeySubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
