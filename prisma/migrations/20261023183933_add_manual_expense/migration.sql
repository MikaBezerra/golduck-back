-- CreateTable
CREATE TABLE "ManualExpense" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "categoryId" UUID NOT NULL,
    "personId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ManualExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualExpense_month_idx" ON "ManualExpense"("month");

-- CreateIndex
CREATE INDEX "ManualExpense_categoryId_idx" ON "ManualExpense"("categoryId");

-- CreateIndex
CREATE INDEX "ManualExpense_personId_idx" ON "ManualExpense"("personId");

-- AddForeignKey
ALTER TABLE "ManualExpense" ADD CONSTRAINT "ManualExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualExpense" ADD CONSTRAINT "ManualExpense_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
