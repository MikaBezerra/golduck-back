-- De quem é a despesa: PENDING (compra do cartão que ninguém classificou), SHARED ou PERSONAL.
-- CreateEnum
CREATE TYPE "ExpenseSplit" AS ENUM ('PENDING', 'SHARED', 'PERSONAL');

-- AlterTable: as linhas que já existem mantêm o cálculo de antes (sem pessoa = compartilhada).
ALTER TABLE "ManualExpense" ADD COLUMN "split" "ExpenseSplit";
UPDATE "ManualExpense" SET "split" = CASE WHEN "personId" IS NULL THEN 'SHARED'::"ExpenseSplit" ELSE 'PERSONAL'::"ExpenseSplit" END;
ALTER TABLE "ManualExpense" ALTER COLUMN "split" SET NOT NULL;

ALTER TABLE "CardExpense" ADD COLUMN "split" "ExpenseSplit";
UPDATE "CardExpense" SET "split" = CASE WHEN "personId" IS NULL THEN 'SHARED'::"ExpenseSplit" ELSE 'PERSONAL'::"ExpenseSplit" END;
ALTER TABLE "CardExpense" ALTER COLUMN "split" SET NOT NULL;

-- Pessoa só na despesa individual (e sempre nela). Despesa manual nunca fica pendente.
ALTER TABLE "ManualExpense" ADD CONSTRAINT "ManualExpense_split_person_check"
    CHECK (("split" = 'PERSONAL') = ("personId" IS NOT NULL) AND "split" <> 'PENDING');
ALTER TABLE "CardExpense" ADD CONSTRAINT "CardExpense_split_person_check"
    CHECK (("split" = 'PERSONAL') = ("personId" IS NOT NULL));

-- CreateIndex
CREATE INDEX "CardExpense_month_split_idx" ON "CardExpense"("month", "split");
