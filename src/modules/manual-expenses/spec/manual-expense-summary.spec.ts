import { summarizeExpenses } from '../service/manual-expense-summary.js';

const PAID_AT = new Date('2026-11-10T12:00:00.000Z');

/** Resumo da aba Despesas: somas em centavos, pago e a pagar. */
describe('summarizeExpenses', () => {
    it('soma o total, o pago e o a pagar em centavos', () => {
        const totals = summarizeExpenses([
            { amountCents: 10_010n, paidAt: null },
            { amountCents: 150_000n, paidAt: PAID_AT },
            { amountCents: 9_990n, paidAt: PAID_AT },
            { amountCents: 20_000n, paidAt: null }
        ]);

        expect(totals).toEqual({ totalCents: 190_000n, paidCents: 159_990n, unpaidCents: 30_010n, count: 4 });
    });

    it('mês sem despesas: tudo zero', () => {
        expect(summarizeExpenses([])).toEqual({ totalCents: 0n, paidCents: 0n, unpaidCents: 0n, count: 0 });
    });
});
