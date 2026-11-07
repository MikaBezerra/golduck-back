import { formatAmountCents, parsePositiveAmountCents } from '../../money/money';

/** Maior valor que cabe no BIGINT do banco: 9223372036854775807 centavos. */
const MAX_AMOUNT = '92233720368547758.07';

/** Dinheiro em centavos: texto em reais ("1234.56") ↔ bigint, sem passar por float. */
describe('parsePositiveAmountCents', () => {
    it.each([
        ['0.01', 1n],
        ['0.1', 10n],
        ['0.10', 10n],
        ['1', 100n],
        ['1.5', 150n],
        ['9', 900n],
        ['10', 1_000n],
        ['99.99', 9_999n],
        ['1234.56', 123_456n],
        ['100.00', 10_000n],
        [MAX_AMOUNT, 9_223_372_036_854_775_807n]
    ])('converte "%s" em %s centavos', (amount, cents) => {
        expect(parsePositiveAmountCents(amount)).toBe(cents);
    });

    it.each([
        ['zero', '0'],
        ['zero com casas', '0.00'],
        ['negativo', '-1'],
        ['negativo com casas', '-0.01'],
        ['zero à esquerda', '01'],
        ['zero à esquerda com casas', '00.50'],
        ['três casas decimais', '1.234'],
        ['ponto sem casas', '1.'],
        ['sem parte inteira', '.5'],
        ['vírgula decimal', '1,50'],
        ['separador de milhar', '1.234,56'],
        ['espaço antes', ' 1'],
        ['espaço depois', '1 '],
        ['letra antes', 'x1'],
        ['letra depois', '1x'],
        ['notação científica', '1e3'],
        ['texto', 'dez reais'],
        ['vazio', ''],
        ['um centavo acima do máximo', '92233720368547758.08'],
        ['muito grande', '100000000000000000000']
    ])('recusa %s ("%s")', (_, amount) => {
        expect(parsePositiveAmountCents(amount)).toBeNull();
    });

    it('recusa texto com mais de 20 caracteres antes de olhar o formato', () => {
        expect(MAX_AMOUNT).toHaveLength(20);
        expect(parsePositiveAmountCents(`${'9'.repeat(18)}.99`)).toBeNull();
        expect(parsePositiveAmountCents('1'.repeat(10_000))).toBeNull();
    });
});

describe('formatAmountCents', () => {
    it.each([
        [0n, '0.00'],
        [1n, '0.01'],
        [5n, '0.05'],
        [10n, '0.10'],
        [50n, '0.50'],
        [99n, '0.99'],
        [100n, '1.00'],
        [123_456n, '1234.56'],
        [-1n, '-0.01'],
        [-50n, '-0.50'],
        [-123_456n, '-1234.56'],
        [9_223_372_036_854_775_807n, MAX_AMOUNT]
    ])('formata %s centavos como "%s"', (cents, text) => {
        expect(formatAmountCents(cents)).toBe(text);
    });

    it('ida e volta: o texto formatado é lido de novo como o mesmo valor', () => {
        for (const cents of [1n, 10n, 101n, 123_456n, 9_223_372_036_854_775_807n]) {
            expect(parsePositiveAmountCents(formatAmountCents(cents))).toBe(cents);
        }
    });
});
