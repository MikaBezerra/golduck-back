-- CreateTable
CREATE TABLE "CardImport" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "parserVersion" VARCHAR(40) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "ignoredCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardExpense" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "sourceMonth" DATE NOT NULL,
    "purchaseKey" VARCHAR(320) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "originalDescription" VARCHAR(200) NOT NULL,
    "holderName" VARCHAR(120),
    "cardLastDigits" VARCHAR(4),
    "amountCents" BIGINT NOT NULL,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "nickname" VARCHAR(160),
    "categoryId" UUID NOT NULL,
    "personId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CardExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardImport_cardId_month_idx" ON "CardImport"("cardId", "month");

-- CreateIndex
CREATE INDEX "CardExpense_cardId_purchaseKey_idx" ON "CardExpense"("cardId", "purchaseKey");

-- CreateIndex
CREATE INDEX "CardExpense_month_idx" ON "CardExpense"("month");

-- CreateIndex
CREATE INDEX "CardExpense_importId_idx" ON "CardExpense"("importId");

-- CreateIndex
CREATE INDEX "CardExpense_categoryId_idx" ON "CardExpense"("categoryId");

-- CreateIndex
CREATE INDEX "CardExpense_personId_idx" ON "CardExpense"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CardExpense_cardId_month_purchaseKey_key" ON "CardExpense"("cardId", "month", "purchaseKey");

-- AddForeignKey
ALTER TABLE "CardImport" ADD CONSTRAINT "CardImport_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardExpense" ADD CONSTRAINT "CardExpense_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardExpense" ADD CONSTRAINT "CardExpense_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CardImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardExpense" ADD CONSTRAINT "CardExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardExpense" ADD CONSTRAINT "CardExpense_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
