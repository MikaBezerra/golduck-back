-- Categorias passam a valer só para as compras do cartão: as despesas fora do cartão deixam de ter categoria.

-- DropForeignKey
ALTER TABLE "ManualExpense" DROP CONSTRAINT "ManualExpense_categoryId_fkey";

-- DropIndex
DROP INDEX "ManualExpense_categoryId_idx";

-- AlterTable
ALTER TABLE "ManualExpense" DROP COLUMN "categoryId";
