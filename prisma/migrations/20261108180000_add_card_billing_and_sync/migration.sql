-- CreateEnum
CREATE TYPE "CardExpenseOrigin" AS ENUM ('UPLOAD', 'SYNC', 'MANUAL');

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "bestPurchaseDay" INTEGER,
ADD COLUMN     "dueDay" INTEGER,
ADD COLUMN     "pluggyAccountId" VARCHAR(64),
ADD COLUMN     "pluggyItemId" UUID,
ADD COLUMN     "syncConsentExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "syncDataUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "syncError" VARCHAR(300),
ADD COLUMN     "syncFromMonth" DATE,
ADD COLUMN     "syncStatus" VARCHAR(40),
ADD COLUMN     "syncedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CardExpense" ADD COLUMN     "externalId" VARCHAR(64),
ADD COLUMN     "origin" "CardExpenseOrigin" NOT NULL DEFAULT 'UPLOAD',
ALTER COLUMN "importId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CardBill" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "bestPurchaseDate" DATE,
    "bankClosingDate" DATE,
    "bankDueDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CardBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPurchaseCorrection" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "purchaseKey" VARCHAR(320) NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentTotal" INTEGER,
    "month" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CardPurchaseCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardBill_cardId_month_key" ON "CardBill"("cardId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CardPurchaseCorrection_cardId_purchaseKey_key" ON "CardPurchaseCorrection"("cardId", "purchaseKey");

-- AddForeignKey
ALTER TABLE "CardBill" ADD CONSTRAINT "CardBill_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPurchaseCorrection" ADD CONSTRAINT "CardPurchaseCorrection_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

