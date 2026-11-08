-- Fatura do cartão e despesa fora do cartão podem ser marcadas como pagas.
-- A fatura guarda também o total no momento do pagamento: se mudar depois (compra que chega atrasada
-- na sincronização), ela continua paga e o app avisa que o valor mudou.

-- AlterTable
ALTER TABLE "CardBill" ADD COLUMN "paidAt" TIMESTAMPTZ(3),
ADD COLUMN "paidAmountCents" BIGINT;

-- AlterTable
ALTER TABLE "ManualExpense" ADD COLUMN "paidAt" TIMESTAMPTZ(3);
