import { addDays, BillingCalendar, dayInMonth, monthOf } from '../service/billing-calendar.js';
import { brazilDay, todayInBrazil } from '../service/brazil-time.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const month = (value: string): Date => day(`${value}-01`);
const ym = (date: Date): string => date.toISOString().slice(0, 7);

/*
 * Ciclo da fatura com os dados reais de novembro de 2026: C6 (melhor dia 25, vence dia 1),
 * Nubank (melhor dia 25, vence dia 2) e Neon (melhor dia 27, vence dia 1). A fatura recebe o nome do
 * mês em que vence.
 */
describe('BillingCalendar', () => {
    const c6 = new BillingCalendar({ dueDay: 1, bestPurchaseDay: 25 });

    it('melhor dia padrão: no mês anterior ao vencimento quando vem depois dele; no próprio mês quando vem antes', () => {
        const sameMonth = new BillingCalendar({ dueDay: 15, bestPurchaseDay: 5 });

        expect(c6.defaultBestPurchaseDate(month('2026-12'))).toEqual(day('2026-11-25'));
        expect(sameMonth.defaultBestPurchaseDate(month('2026-12'))).toEqual(day('2026-12-05'));
        expect(sameMonth.billMonthOf(day('2026-12-04'))).toEqual(month('2026-12'));
        expect(sameMonth.billMonthOf(day('2026-12-05'))).toEqual(month('2027-01'));
    });

    it('a compra do melhor dia em diante vai para a fatura seguinte', () => {
        expect(ym(c6.billMonthOf(day('2026-11-06')))).toBe('2026-12');
        expect(ym(c6.billMonthOf(day('2026-11-24')))).toBe('2026-12');
        expect(ym(c6.billMonthOf(day('2026-11-25')))).toBe('2027-01');
        expect(ym(c6.billMonthOf(day('2026-12-24')))).toBe('2027-01');
        expect(ym(c6.billMonthOf(day('2026-12-31')))).toBe('2027-02');
        expect(ym(c6.billMonthOf(day('2027-01-01')))).toBe('2027-02');
    });

    it('fechamento informado pelo banco vale sobre o ajuste do usuário, que vale sobre o padrão', () => {
        const calendar = new BillingCalendar({ dueDay: 1, bestPurchaseDay: 25 }, [
            // Fatura de novembro do C6, que "fecha 25/10": fica com o que o banco lançou até 24/10.
            { month: month('2026-11'), bestPurchaseDate: day('2026-10-28'), bankClosingDate: day('2026-10-25'), bankDueDate: day('2026-11-03') },
            { month: month('2026-12'), bestPurchaseDate: day('2026-11-27'), bankClosingDate: null, bankDueDate: null }
        ]);

        expect(calendar.schedule(month('2026-11'))).toEqual({
            month: month('2026-11'),
            bestPurchaseDate: day('2026-10-25'),
            closingDate: day('2026-10-24'),
            dueDate: day('2026-11-03'),
            source: 'bank',
            userBestPurchaseDate: day('2026-10-28')
        });
        expect(calendar.schedule(month('2026-12'))).toMatchObject({ bestPurchaseDate: day('2026-11-27'), dueDate: day('2026-12-01'), source: 'user' });
        expect(calendar.schedule(month('2027-01'))).toMatchObject({ bestPurchaseDate: day('2026-12-25'), source: 'default' });
        expect(ym(calendar.billMonthOf(day('2026-10-24')))).toBe('2026-11');
        expect(ym(calendar.billMonthOf(day('2026-10-25')))).toBe('2026-12');
        expect(ym(calendar.billMonthOf(day('2026-11-26')))).toBe('2026-12');
        expect(ym(calendar.billMonthOf(day('2026-11-27')))).toBe('2027-01');
    });

    it('Neon (melhor dia 27): as compras que o usuário conferiu caem nas faturas certas', () => {
        const neon = new BillingCalendar({ dueDay: 1, bestPurchaseDay: 27 });

        expect(ym(neon.billMonthOf(day('2026-08-09')))).toBe('2026-09');
        expect(ym(neon.billMonthOf(day('2026-08-27')))).toBe('2026-10');
        expect(ym(neon.billMonthOf(day('2026-09-15')))).toBe('2026-10');
        expect(ym(neon.billMonthOf(day('2026-10-18')))).toBe('2026-11');
        expect(ym(neon.billMonthOf(day('2026-02-28')))).toBe('2026-04');
    });

    it('dia 31 vira o último dia em meses mais curtos', () => {
        const calendar = new BillingCalendar({ dueDay: 10, bestPurchaseDay: 31 });

        expect(dayInMonth(month('2027-02'), 31)).toEqual(day('2027-02-28'));
        expect(calendar.schedule(month('2027-03'))).toMatchObject({ bestPurchaseDate: day('2027-02-28'), dueDate: day('2027-03-10') });
    });

    it('ajuste fora da ordem normal: depois de três tentativas fica a fatura de dois meses à frente', () => {
        const calendar = new BillingCalendar({ dueDay: 1, bestPurchaseDay: 25 }, [
            { month: month('2027-01'), bestPurchaseDate: day('2026-10-01'), bankClosingDate: null, bankDueDate: null }
        ]);

        expect(ym(calendar.billMonthOf(day('2026-12-26')))).toBe('2027-02');
    });

    it('auxiliares de data', () => {
        expect(addDays(day('2026-12-31'), 1)).toEqual(day('2027-01-01'));
        expect(monthOf(day('2026-11-24'))).toEqual(month('2026-11'));
    });
});

describe('horário de Brasília', () => {
    it('brazilDay converte o instante em UTC no dia de Brasília (UTC−3)', () => {
        // 22h31 de 22/10 em Brasília.
        expect(brazilDay(new Date('2026-10-23T01:31:00.000Z'))).toEqual(day('2026-10-22'));
        expect(brazilDay(new Date('2026-10-23T03:00:00.000Z'))).toEqual(day('2026-10-23'));
    });

    it('todayInBrazil usa o relógio informado', () => {
        expect(todayInBrazil(new Date('2026-11-09T02:59:59.000Z'))).toEqual(day('2026-11-08'));
        expect(todayInBrazil()).toBeInstanceOf(Date);
    });
});
