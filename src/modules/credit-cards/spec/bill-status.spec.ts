import { isBillClosed, resolveBillStatus } from '../service/bill-status.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Situação da fatura: aberta, fechada, vencida ou paga, com e sem o ciclo configurado no cartão. */
describe('bill-status', () => {
    const december = { month: day('2026-12-01'), closingDate: day('2026-11-24'), dueDate: day('2026-12-01') };

    it('com o ciclo: fecha no dia seguinte ao último dia de compra', () => {
        expect(isBillClosed(december, day('2026-11-24'))).toBe(false);
        expect(isBillClosed(december, day('2026-11-25'))).toBe(true);
    });

    it('sem o ciclo: fechada a partir do mês do vencimento', () => {
        const bill = { month: day('2026-12-01'), closingDate: null, dueDate: null };

        expect(isBillClosed(bill, day('2026-11-30'))).toBe(false);
        expect(isBillClosed(bill, day('2026-12-01'))).toBe(true);
        expect(isBillClosed(bill, day('2027-02-10'))).toBe(true);
    });

    it('aberta, fechada até o vencimento e vencida depois dele', () => {
        expect(resolveBillStatus({ ...december, paidAt: null }, day('2026-11-20'))).toBe('open');
        expect(resolveBillStatus({ ...december, paidAt: null }, day('2026-11-25'))).toBe('closed');
        expect(resolveBillStatus({ ...december, paidAt: null }, day('2026-12-01'))).toBe('closed');
        expect(resolveBillStatus({ ...december, paidAt: null }, day('2026-12-02'))).toBe('overdue');
    });

    it('paga vale sobre as outras; sem vencimento conhecido nunca fica vencida', () => {
        const paidAt = new Date('2026-11-28T12:00:00.000Z');

        expect(resolveBillStatus({ ...december, paidAt }, day('2027-03-01'))).toBe('paid');
        expect(resolveBillStatus({ month: day('2026-10-01'), closingDate: null, dueDate: null, paidAt: null }, day('2027-03-01'))).toBe('closed');
    });
});
