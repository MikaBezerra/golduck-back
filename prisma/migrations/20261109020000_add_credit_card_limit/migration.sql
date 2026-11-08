-- Limite do cartão, informado pelo usuário: o resumo das faturas mostra o limite disponível.

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN "creditLimitCents" BIGINT;
