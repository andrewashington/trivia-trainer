-- How Gay?: one deterministic daily reading per user.
CREATE TABLE "GayReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GayReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GayReading_userId_date_key" ON "GayReading"("userId", "date");

CREATE INDEX "GayReading_date_idx" ON "GayReading"("date");

ALTER TABLE "GayReading" ADD CONSTRAINT "GayReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
