import { normalizePluggyTransactions } from '../service/pluggy-transaction.normalizer.js';
import { c6Description, neonDescription, pluggyTransaction } from './pluggy-fixtures.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Tradução das transações da Pluggy para o formato do Golduck, banco a banco. */
describe('normalizePluggyTransactions', () => {
    it('C6: fica só o estabelecimento; a data vira o dia de Brasília; o final do cartão vem dos metadados', () => {
        const { transactions, ignoredCount } = normalizePluggyTransactions('C6', [
            pluggyTransaction({
                description: c6Description('MERCADINHO DO BAIRRO'),
                amount: 75.37,
                // 22h31 de 22/10 em Brasília.
                date: '2026-10-23T01:31:00.000Z',
                creditCardMetadata: { cardNumber: '1234' }
            }),
            pluggyTransaction({ description: c6Description('DL          *UBERRIDES', 'SAO PAULO'), amount: 14, date: '2026-10-16T14:24:00.000Z' }),
            pluggyTransaction({ description: 'MP *LOJAONLINE', amount: 10, date: '2026-10-01T03:00:00.000Z' })
        ]);

        expect(ignoredCount).toBe(0);
        expect(transactions.map(transaction => [transaction.description, transaction.postedDate, transaction.cardLastDigits])).toEqual([
            ['MERCADINHO DO BAIRRO', day('2026-10-22'), '1234'],
            ['DL *UBERRIDES', day('2026-10-16'), null],
            ['MP *LOJAONLINE', day('2026-10-01'), null]
        ]);
        expect(transactions[0]).toMatchObject({ amountCents: 7537n, installmentNumber: null, installmentTotal: null, purchaseDate: day('2026-10-22') });
    });

    it('parcelas: número e total dos metadados, data da compra original e a fatura do banco quando vier', () => {
        const [installment] = normalizePluggyTransactions('C6', [pluggyTransaction({
            description: c6Description('LOJA DE MOVEIS'),
            amount: 114,
            date: '2026-11-03T03:00:00.000Z',
            creditCardMetadata: {
                installmentNumber: 4, totalInstallments: 5, purchaseDate: '2026-08-07T13:32:00.000Z', billId: 'fatura-1', cardNumber: '1234'
            }
        })]).transactions;

        expect(installment).toMatchObject({
            description: 'LOJA DE MOVEIS',
            postedDate: day('2026-11-03'),
            purchaseDate: day('2026-08-07'),
            installmentNumber: 4,
            installmentTotal: 5,
            billId: 'fatura-1'
        });
    });

    it('Nubank: tira o " 4/8" do fim da descrição', () => {
        const [first] = normalizePluggyTransactions('NUBANK', [pluggyTransaction({
            description: 'Loja de Construcao 4/8',
            amount: 66.38,
            date: '2026-10-26T03:00:00.000Z',
            creditCardMetadata: { installmentNumber: 4, totalInstallments: 8, purchaseDate: '2026-08-07T15:15:36.001Z', cardNumber: '9876' }
        })]).transactions;

        expect(first).toMatchObject({ description: 'Loja de Construcao', installmentNumber: 4, installmentTotal: 8 });
    });

    it('Neon: largura fixa nas compras à vista, parcela pelo " 1/5" quando faltam os metadados e cartão "0000" é desconhecido', () => {
        const { transactions } = normalizePluggyTransactions('NEON', [
            pluggyTransaction({ description: neonDescription('HAMBURGUERIA'), amount: 76, date: '2025-11-30T22:00:00.000Z', operationType: 'OUTROS' }),
            pluggyTransaction({
                description: 'LOJA ESPORTIVA EXTREMA BR 1/5',
                amount: 131.6,
                date: '2026-09-15T11:17:00.000Z',
                operationType: 'OUTROS',
                creditCardMetadata: { cardNumber: '0000' }
            }),
            pluggyTransaction({ description: neonDescription('LIVRARIA', 'SAO PAULO'), amount: 41.9, date: '2026-10-18T14:17:00.000Z' })
        ]);

        expect(transactions.map(transaction => [transaction.description, transaction.installmentNumber, transaction.installmentTotal, transaction.cardLastDigits])).toEqual([
            ['HAMBURGUERIA', null, null, null],
            ['LOJA ESPORTIVA EXTREMA BR', 1, 5, null],
            ['LIVRARIA', null, null, null]
        ]);
        expect(transactions[1].purchaseDate).toEqual(day('2026-09-15'));
    });

    it('compra em dólar usa o valor em reais; sem ele, fica de fora', () => {
        const { transactions, ignoredCount } = normalizePluggyTransactions('C6', [
            pluggyTransaction({
                description: c6Description('ASSINATURA ONLINE', 'SAN FRANCISCO', 'USA'),
                amount: 20,
                amountInAccountCurrency: 109.95,
                currencyCode: 'USD',
                date: '2026-10-05T15:30:00.000Z'
            }),
            pluggyTransaction({ description: 'OUTRA ASSINATURA', amount: 5, currencyCode: 'USD', date: '2026-10-05T15:30:00.000Z' })
        ]);

        expect(transactions.map(transaction => [transaction.description, transaction.amountCents])).toEqual([['ASSINATURA ONLINE', 10995n]]);
        expect(ignoredCount).toBe(1);
    });

    it('ignora pagamentos da fatura, estornos e créditos; a tarifa entra como despesa', () => {
        const { transactions, ignoredCount } = normalizePluggyTransactions('C6', [
            pluggyTransaction({
                description: 'Inclusao de Pagamento Ciclo Corrente', amount: -1000, date: '2026-10-25T03:00:00.000Z', operationType: 'PAGAMENTO_FATURA', type: 'CREDIT'
            }),
            pluggyTransaction({ description: 'Estorno Tarifa', amount: -50, date: '2026-10-20T03:00:00.000Z', operationType: 'ESTORNO', type: 'CREDIT' }),
            pluggyTransaction({ description: 'Pagamento recebido', amount: 10, date: '2026-10-20T03:00:00.000Z', operationType: 'PAGAMENTO_FATURA' }),
            pluggyTransaction({ description: 'Credito avulso', amount: 0, date: '2026-10-20T03:00:00.000Z', operationType: null }),
            pluggyTransaction({ description: 'Tarifa Anuidade', amount: 50, date: '2026-10-20T03:00:00.000Z', operationType: 'TARIFA' })
        ]);

        expect(transactions.map(transaction => transaction.description)).toEqual(['Tarifa Anuidade']);
        expect(ignoredCount).toBe(4);
    });

    it('parcela inválida (1/1, 6/5) vira compra à vista', () => {
        const { transactions } = normalizePluggyTransactions('NUBANK', [
            pluggyTransaction({ description: 'Loja A 1/1', amount: 10, date: '2026-10-20T12:00:00.000Z' }),
            pluggyTransaction({ description: 'Loja B', amount: 10, date: '2026-10-20T12:00:00.000Z', creditCardMetadata: { installmentNumber: 6, totalInstallments: 5 } })
        ]);

        expect(transactions.map(transaction => [transaction.description, transaction.installmentTotal])).toEqual([['Loja A', null], ['Loja B', null]]);
    });
});
