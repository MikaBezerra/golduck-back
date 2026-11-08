import { summarizeByCategory } from '../service/manual-expense-summary.js';

const PAID_AT = new Date('2026-11-10T12:00:00.000Z');

/** Resumo por categoria da aba Despesas: somas em centavos, pago/a pagar e ordem do maior para o menor. */
describe('summarizeByCategory', () => {
    const categories = [
        { id: 'casa', name: 'Casa' },
        { id: 'mercado', name: 'Mercado' },
        { id: 'lazer', name: 'Lazer' }
    ];

    it('soma por categoria, do maior total para o menor; empate pelo nome', () => {
        const totals = summarizeByCategory([
            { categoryId: 'mercado', amountCents: 10_010n, paidAt: null },
            { categoryId: 'casa', amountCents: 150_000n, paidAt: PAID_AT },
            { categoryId: 'mercado', amountCents: 9_990n, paidAt: PAID_AT },
            { categoryId: 'lazer', amountCents: 20_000n, paidAt: null }
        ], categories);

        expect(totals).toEqual({
            totalCents: 190_000n,
            paidCents: 159_990n,
            unpaidCents: 30_010n,
            count: 4,
            categories: [
                { categoryId: 'casa', name: 'Casa', totalCents: 150_000n, count: 1 },
                { categoryId: 'lazer', name: 'Lazer', totalCents: 20_000n, count: 1 },
                { categoryId: 'mercado', name: 'Mercado', totalCents: 20_000n, count: 2 }
            ]
        });
    });

    it('mês sem despesas: tudo zero e nenhuma categoria', () => {
        expect(summarizeByCategory([], categories)).toEqual({ totalCents: 0n, paidCents: 0n, unpaidCents: 0n, count: 0, categories: [] });
    });

    it('categoria que não veio na lista fica sem nome (não some do total)', () => {
        const totals = summarizeByCategory([{ categoryId: 'apagada', amountCents: 500n, paidAt: null }], categories);

        expect(totals.categories).toEqual([{ categoryId: 'apagada', name: '', totalCents: 500n, count: 1 }]);
        expect(totals.totalCents).toBe(500n);
    });
});
