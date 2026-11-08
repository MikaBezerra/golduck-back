import { addMonths, formatDate, formatMonth, parseMonth } from '../../date/month.js';

/** Mês "AAAA-MM" ↔ data do 1º dia do mês em UTC. */
describe('parseMonth', () => {
    it.each([
        ['2026-01', '2026-01-01T00:00:00.000Z'],
        ['2026-11', '2026-11-01T00:00:00.000Z'],
        ['2026-12', '2026-12-01T00:00:00.000Z'],
        ['2000-02', '2000-02-01T00:00:00.000Z']
    ])('"%s" vira o 1º dia do mês à meia-noite UTC (%s)', (month, iso) => {
        expect(parseMonth(month).toISOString()).toBe(iso);
    });
});

describe('formatMonth e formatDate', () => {
    it('usam a data em UTC, sem a hora', () => {
        const date = new Date('2026-11-07T23:59:59.999Z');

        expect(formatMonth(date)).toBe('2026-11');
        expect(formatDate(date)).toBe('2026-11-07');
    });

    it('meses e dias de um dígito ganham zero à esquerda', () => {
        const date = new Date('2026-03-05T00:00:00.000Z');

        expect(formatMonth(date)).toBe('2026-03');
        expect(formatDate(date)).toBe('2026-03-05');
    });

    it('ida e volta com parseMonth', () => {
        expect(formatMonth(parseMonth('2026-09'))).toBe('2026-09');
    });
});

describe('addMonths', () => {
    const november = new Date('2026-11-01T00:00:00.000Z');

    it.each([
        [0, '2026-11-01T00:00:00.000Z'],
        [1, '2026-12-01T00:00:00.000Z'],
        [2, '2027-01-01T00:00:00.000Z'],
        [12, '2027-11-01T00:00:00.000Z'],
        [-1, '2026-10-01T00:00:00.000Z'],
        [-11, '2025-12-01T00:00:00.000Z']
    ])('soma %s mês(es) e cai no 1º dia (%s)', (amount, iso) => {
        expect(addMonths(november, amount).toISOString()).toBe(iso);
    });

    it('a partir de uma data no meio do mês, devolve o 1º dia do mês resultante', () => {
        expect(addMonths(new Date('2026-01-31T15:30:00.000Z'), 1).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    it('não altera a data recebida', () => {
        addMonths(november, 3);

        expect(november.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });
});
