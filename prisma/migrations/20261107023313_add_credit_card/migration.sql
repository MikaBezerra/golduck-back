-- CreateEnum
CREATE TYPE "CardBank" AS ENUM ('NUBANK', 'C6');

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "bank" "CardBank" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCard_active_name_idx" ON "CreditCard"("active", "name");
