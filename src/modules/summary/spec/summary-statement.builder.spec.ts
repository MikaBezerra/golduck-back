import { buildStatement, reconcile, StatementRow, StatementSource } from '../service/summary-statement.builder.js';

/*
 * Tabela do mês (função pura): divisão da entrada e do compartilhado, colunas das pessoas, detalhes
 * por despesa e por cartão, líquidos iguais aos do resumo e a quebra do líquido de cada pessoa.
 */
const source: StatementSource = {
    month: new Date('2026-11-01T00:00:00.000Z'),
    incomeCents: 600_000n,
    reserveCents: 50_000n,
    reserveAccumulatedCents: 350_000n,
    people: [
        { id: 'bruno', name: 'Bruno', active: true },
        { id: 'ana', name: 'Ana', active: true },
        { id: 'carla', name: 'Carla', active: false },
        { id: 'davi', name: 'Davi', active: false }
    ],
    manualExpenses: [
        { id: 'm1', title: 'Aluguel', amountCents: 220_000n, personId: null },
        { id: 'm2', title: 'Condomínio', amountCents: 65_001n, personId: null },
        { id: 'm3', title: 'Curso', amountCents: 42_000n, personId: 'bruno' },
        { id: 'm4', title: 'Presente', amountCents: 9_000n, personId: 'carla' },
        { id: 'm5', title: 'Livro', amountCents: 50_000n, personId: 'bruno' }
    ],
    cardExpenses: [
        { id: 'c1', cardId: 'nubank', amountCents: 41_235n, split: 'SHARED', personId: null },
        { id: 'c2', cardId: 'nubank', amountCents: 7_800n, split: 'PERSONAL', personId: 'ana' },
        { id: 'c3', cardId: 'c6', amountCents: 1_000n, split: 'PERSONAL', personId: 'bruno' },
        // Ainda sem pessoa: entra no compartilhado e no aviso de pendentes.
        { id: 'c4', cardId: 'sumido', amountCents: 500n, split: 'PENDING', personId: null }
    ],
    cards: [{ id: 'nubank', name: 'Nubank da Ana' }, { id: 'c6', name: 'C6' }]
};

const rowsOf = (input: StatementSource): StatementRow[] => buildStatement(input).sections.flatMap(section => section.rows);
const rowOf = (id: string, input: StatementSource = source): StatementRow => {
    const found = rowsOf(input).find(item => item.id === id);

    if (!found) {
        throw new Error(`linha ${id} não encontrada`);
    }

    return found;
};
const cents = (value: string | null): bigint => BigInt(Math.round(Number(value ?? '0') * 100));

describe('buildStatement', () => {
    it('mostra as pessoas ativas em ordem alfabética e as inativas só se tiverem gasto individual', () => {
        const statement = buildStatement(source);

        expect(statement.month).toBe('2026-11');
        expect(statement.columns).toEqual([
            { id: 'ana', name: 'Ana', initial: 'A', inactive: false },
            { id: 'bruno', name: 'Bruno', initial: 'B', inactive: false },
            { id: 'carla', name: 'Carla', initial: 'C', inactive: true }
        ]);
        expect(statement.sections.map(section => section.id)).toEqual(['income', 'shared', 'individual', 'result']);
        expect(statement.hasPeople).toBe(true);
        expect(statement.incomeMissing).toBe(false);
    });

    it('avisa as compras do cartão ainda sem pessoa, que já entram no compartilhado', () => {
        expect(buildStatement(source).pending).toEqual({ amount: '5.00', count: 1 });
        expect(cents(rowOf('shared-card').total)).toBe(41_235n + 500n);
        expect(buildStatement({ ...source, cardExpenses: source.cardExpenses.filter(expense => expense.id !== 'c4') }).pending)
            .toEqual({ amount: '0.00', count: 0 });
    });

    it('divide entrada e compartilhado igualmente; as linhas do compartilhado somam a parte de cada um', () => {
        expect(rowOf('income')).toMatchObject({ total: '6000.00', note: null, cells: ['3000.00', '3000.00', null] });
        expect(rowOf('shared-fixed').total).toBe('2850.01');
        expect(rowOf('shared-card').total).toBe('417.35');
        expect(rowOf('reserve')).toMatchObject({ total: '500.00', note: 'guardado no mês' });
        // 6000.00 − 3767.36 = 2232.64, dividido em 1116.32 + 1116.32
        expect(rowOf('shared-total')).toMatchObject({ total: '3767.36', cells: ['1883.68', '1883.68', null], style: 'subtotal' });

        for (const column of [0, 1]) {
            const parts = ['shared-fixed', 'shared-card', 'reserve'].map(id => cents(rowOf(id).cells[column]));

            expect(parts.reduce((total, value) => total + value, 0n)).toBe(188_368n);
        }
    });

    it('lista os detalhes do compartilhado por valor e por cartão (cartão sem nome vira "Cartão")', () => {
        expect(rowOf('shared-fixed').children.map(child => `${child.label}:${child.total}`)).toEqual(['Aluguel:2200.00', 'Condomínio:650.01']);
        expect(rowOf('shared-fixed').children[0]).toMatchObject({ id: 'shared-fixed-m1', cells: [null, null, null], style: 'detail' });
        expect(rowOf('shared-card').children.map(child => `${child.label}:${child.total}`)).toEqual(['Cartão:5.00', 'Nubank da Ana:412.35']);
    });

    it('põe cada gasto individual na coluna da pessoa (inclusive inativa)', () => {
        expect(rowOf('individual-fixed').cells).toEqual(['0.00', '920.00', '90.00']);
        expect(rowOf('individual-fixed').children.map(child => [child.label, child.cells])).toEqual([
            ['Livro', [null, '500.00', null]],
            ['Curso', [null, '420.00', null]],
            ['Presente', [null, null, '90.00']]
        ]);
        expect(rowOf('individual-card').cells).toEqual(['78.00', '10.00', '0.00']);
        expect(rowOf('individual-card').children.map(child => [child.label, child.cells])).toEqual([
            ['C6', [null, '10.00', null]],
            ['Nubank da Ana', ['78.00', null, null]]
        ]);
        expect(rowOf('individual-total')).toMatchObject({ total: '1098.00', cells: ['78.00', '930.00', '90.00'] });
    });

    it('calcula os líquidos como o resumo', () => {
        expect(rowOf('spent')).toMatchObject({ total: '4865.36', cells: ['1961.68', '2813.68', '90.00'] });
        expect(rowOf('net-shared')).toMatchObject({ total: '2232.64', cells: ['1116.32', '1116.32', null], style: 'result' });
        expect(rowOf('net-individual')).toMatchObject({ total: '1224.64', cells: ['1038.32', '186.32', null], style: 'highlight' });
    });

    it('quebra o líquido de cada pessoa ativa sem descontar a reserva duas vezes', () => {
        const { breakdown, reserve } = buildStatement(source);

        expect(breakdown).toEqual([
            { personId: 'ana', name: 'Ana', beforeReserve: '1366.32', individual: '78.00', reserve: '250.00', net: '1038.32' },
            { personId: 'bruno', name: 'Bruno', beforeReserve: '1366.32', individual: '930.00', reserve: '250.00', net: '186.32' }
        ]);

        for (const item of breakdown) {
            expect(cents(item.beforeReserve) - cents(item.individual) - cents(item.reserve)).toBe(cents(item.net));
        }

        expect(reserve).toEqual({ month: '500.00', accumulated: '3500.00' });
    });

    it('com reserva ímpar, a parte de cada um na reserva fecha a conta no centavo', () => {
        const odd: StatementSource = { ...source, reserveCents: 50_001n };
        const { breakdown } = buildStatement(odd);

        expect(breakdown.map(item => item.reserve).map(cents).reduce((total, value) => total + value, 0n)).toBe(50_001n);

        for (const item of breakdown) {
            expect(cents(item.beforeReserve) - cents(item.individual) - cents(item.reserve)).toBe(cents(item.net));
        }
    });

    it('sem entrada e sem reserva no mês, avisa e trata como zero', () => {
        const empty: StatementSource = { ...source, incomeCents: null, reserveCents: null, reserveAccumulatedCents: 0n };
        const statement = buildStatement(empty);

        expect(statement.incomeMissing).toBe(true);
        expect(rowOf('income', empty)).toMatchObject({ total: null, note: 'não cadastrada', cells: [null, null, null] });
        expect(rowOf('reserve', empty)).toMatchObject({ total: '0.00', note: 'não cadastrada' });
        expect(rowOf('net-shared', empty).total).toBe('-3267.36');
        expect(statement.reserve).toEqual({ month: null, accumulated: '0.00' });
        expect(statement.breakdown[0]).toMatchObject({ reserve: '0.00' });
    });

    it('sem pessoas ativas: sem divisão, sem quebra e o líquido individual é o saldo do mês', () => {
        const nobody: StatementSource = {
            ...source,
            people: source.people.map(person => ({ ...person, active: false }))
        };
        const statement = buildStatement(nobody);

        expect(statement.hasPeople).toBe(false);
        expect(statement.breakdown).toEqual([]);
        expect(statement.columns.map(column => column.id)).toEqual(['ana', 'bruno', 'carla']);
        expect(rowOf('income', nobody).cells).toEqual([null, null, null]);
        // 6000.00 − 3767.36 − 1098.00
        expect(rowOf('net-individual', nobody).total).toBe('1134.64');
    });
});

describe('reconcile', () => {
    it('ajusta as linhas para somarem o alvo de cada pessoa sem mudar o total da linha', () => {
        const rows = reconcile([[142_501n, 142_500n], [20_618n, 20_617n]], [163_118n, 163_118n]);

        expect(rows[0][0] + rows[0][1]).toBe(285_001n);
        expect(rows[1][0] + rows[1][1]).toBe(41_235n);
        expect(rows[0][0] + rows[1][0]).toBe(163_118n);
        expect(rows[0][1] + rows[1][1]).toBe(163_118n);
    });

    it('no empate do equilíbrio, ajusta a linha de maior valor (inclusive negativa)', () => {
        expect(reconcile([[1n, 1n], [-500n, -500n]], [-498n, -500n])).toEqual([[1n, 1n], [-499n, -501n]]);
    });

    it('sem linhas ou sem pessoas, devolve como veio', () => {
        expect(reconcile([], [10n])).toEqual([]);
        expect(reconcile([[], []], [])).toEqual([[], []]);
    });
});
