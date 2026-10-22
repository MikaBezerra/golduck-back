/*
  Warnings:

  - You are about to drop the `Passenger` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Passenger";

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(16),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_active_name_idx" ON "Person"("active", "name");
