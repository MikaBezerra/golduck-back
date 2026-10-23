-- CreateTable
CREATE TABLE "MonthlyIncome" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonthlyIncome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyIncome_month_key" ON "MonthlyIncome"("month");
