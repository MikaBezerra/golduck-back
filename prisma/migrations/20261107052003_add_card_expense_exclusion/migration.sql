-- AlterTable
ALTER TABLE "CardExpense" ADD COLUMN     "excludedAt" TIMESTAMPTZ(3),
ADD COLUMN     "exclusionRemembered" BOOLEAN NOT NULL DEFAULT false;
