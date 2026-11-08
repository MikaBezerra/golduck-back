import {
    formatMoney,
    formatMonthLabel,
    maskEmail,
    renderSummaryEmail,
    SummaryEmailInput
} from '../service/summary-email.renderer.js';

/*
 * E-mail do resumo (função pura): assunto com "até" só no mês corrente (horário de Brasília), os
 * quatro valores do líquido, a reserva do mês e acumulada, HTML escapado e a versão em texto.
 */
const input: SummaryEmailInput = {
    month: '2026-11',
    name: 'Ana',
    beforeReserve: '3000.00',
    individual: '800.00',
    reserveShare: '500.00',
    net: '1700.00',
    reserveMonth: '1000.00',
    reserveAccumulated: '12345.67',
    now: new Date('2026-11-08T15:00:00.000Z')
};

describe('renderSummaryEmail', () => {
    it('no mês corrente, avisa que o resumo é parcial até hoje', () => {
        const email = renderSummaryEmail(input);

        expect(email.subject).toBe('Golduck · Resumo de novembro/2026 (até 08/11)');
        expect(email.text).toContain('Este é o seu resumo de novembro/2026 (parcial, até 08/11).');
    });

    it('usa o dia de Brasília: 02:00 UTC de 1º de dezembro ainda é 30 de novembro', () => {
        const email = renderSummaryEmail({ ...input, now: new Date('2026-12-01T02:00:00.000Z') });

        expect(email.subject).toBe('Golduck · Resumo de novembro/2026 (até 30/11)');
    });

    it('mês que já acabou (ou futuro): sem "parcial"', () => {
        const past = renderSummaryEmail({ ...input, now: new Date('2027-01-10T12:00:00.000Z') });
        const future = renderSummaryEmail({ ...input, now: new Date('2026-10-10T12:00:00.000Z') });

        for (const email of [past, future]) {
            expect(email.subject).toBe('Golduck · Resumo de novembro/2026');
            expect(email.text).toContain('Este é o seu resumo de novembro/2026.');
        }
    });

    it('mostra o líquido em etapas e a reserva do mês e acumulada (texto puro)', () => {
        expect(renderSummaryEmail(input).text).toBe([
            'Olá, Ana!',
            '',
            'Este é o seu resumo de novembro/2026 (parcial, até 08/11).',
            '',
            'Líquido sem gastos individuais: R$ 3.000,00',
            '(−) Gastos individuais: R$ 800,00',
            '(−) Sua parte da reserva: R$ 500,00',
            'Líquido: R$ 1.700,00',
            '',
            'Reserva',
            'Guardado neste mês: R$ 1.000,00',
            'Reserva acumulada até novembro/2026: R$ 12.345,67',
            '',
            'Enviado pelo Golduck.'
        ].join('\n'));
    });

    it('HTML com os mesmos valores, líquido verde quando positivo e vermelho quando negativo', () => {
        const positive = renderSummaryEmail(input).html;
        const negative = renderSummaryEmail({ ...input, net: '-10.50' }).html;

        expect(positive).toContain('<html lang="pt-BR">');
        expect(positive).toContain('Olá, Ana!');
        expect(positive).toContain('R$ 3.000,00');
        expect(positive).toContain('R$ 12.345,67');
        expect(positive).toContain('color:#15803d;">R$ 1.700,00');
        expect(negative).toContain('color:#b91c1c;">-R$ 10,50');
    });

    it('sem reserva no mês, diz que nada foi guardado', () => {
        const email = renderSummaryEmail({ ...input, reserveMonth: null, reserveShare: '0.00' });

        expect(email.text).toContain('Guardado neste mês: Nada guardado neste mês');
        expect(email.html).toContain('Nada guardado neste mês');
    });

    it('escapa o nome no HTML (o texto puro fica como está)', () => {
        const email = renderSummaryEmail({ ...input, name: '<b>Zé & "Cia" \'</b>' });

        expect(email.html).toContain('Olá, &lt;b&gt;Zé &amp; &quot;Cia&quot; &#39;&lt;/b&gt;!');
        expect(email.text).toContain('Olá, <b>Zé & "Cia" \'</b>!');
    });
});

describe('formatMoney', () => {
    it.each([
        ['0.00', 'R$ 0,00'],
        ['5', 'R$ 5,00'],
        ['999.9', 'R$ 999,90'],
        ['1000.00', 'R$ 1.000,00'],
        ['1234567.89', 'R$ 1.234.567,89'],
        ['-1234.50', '-R$ 1.234,50']
    ])('%s → %s', (amount, expected) => {
        expect(formatMoney(amount)).toBe(expected);
    });
});

describe('formatMonthLabel', () => {
    it('mês por extenso e ano', () => {
        expect(formatMonthLabel('2026-01')).toBe('janeiro/2026');
        expect(formatMonthLabel('2027-12')).toBe('dezembro/2027');
    });
});

describe('maskEmail', () => {
    it.each([
        ['ayanne@gmail.com', 'ay•••@gmail.com'],
        ['ab@x.com', 'a•••@x.com'],
        ['a@x.com', 'a•••@x.com'],
        ['sem-arroba', '•••'],
        ['@x.com', '•••']
    ])('%s → %s', (email, expected) => {
        expect(maskEmail(email)).toBe(expected);
    });
});
