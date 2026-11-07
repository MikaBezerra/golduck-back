import { compareByAmountThenName, mergeGroups, netByParticipant, splitEvenly } from '../service/summary.calculator';

describe('splitEvenly', () => {
    it.each([
        [1000n, 2, [500n, 500n]],
        [1001n, 2, [501n, 500n]],
        [1000n, 3, [334n, 333n, 333n]],
        [-1001n, 2, [-501n, -500n]],
        [-12000n, 2, [-6000n, -6000n]],
        [1n, 3, [1n, 0n, 0n]],
        [0n, 2, [0n, 0n]]
    ])('divide %s em %s partes', (amount, parts, expected) => {
        const result = splitEvenly(amount, parts);

        expect(result).toEqual(expected);
        expect(result.reduce((sum, part) => sum + part, 0n)).toBe(amount);
    });

    it('sem pessoas, não há partes', () => {
        expect(splitEvenly(1000n, 0)).toEqual([]);
    });
});

describe('netByParticipant', () => {
    const mikaell = { id: 'b', name: 'Mikaell' };
    const ayanne = { id: 'a', name: 'Ayanne' };

    it('aplica (E − C) / k − Dₚ, com o centavo extra para a primeira em ordem alfabética', () => {
        const result = netByParticipant(850001n, 300000n, [mikaell, ayanne], new Map([['b', 50000n], ['a', 10000n]]));

        expect(result.map(item => [item.participant.name, item.shareCents, item.individualCents, item.netCents])).toEqual([
            ['Ayanne', 275001n, 10000n, 265001n],
            ['Mikaell', 275000n, 50000n, 225000n]
        ]);
    });

    it('sem entrada, a parte de cada um é negativa', () => {
        const [first] = netByParticipant(0n, 1000n, [ayanne, mikaell], new Map());

        expect(first.shareCents).toBe(-500n);
        expect(first.netCents).toBe(-500n);
    });
});

describe('mergeGroups', () => {
    it('soma valores e quantidades de mesma chave, inclusive null', () => {
        const merged = mergeGroups(
            [{ key: 'x', amountCents: 100n, count: 1 }, { key: null, amountCents: 50n, count: 2 }],
            [{ key: 'x', amountCents: 25n, count: 3 }, { key: null, amountCents: 5n, count: 1 }]
        );

        expect(merged).toEqual([
            { key: 'x', amountCents: 125n, count: 4 },
            { key: null, amountCents: 55n, count: 3 }
        ]);
    });
});

describe('compareByAmountThenName', () => {
    it('ordena por valor decrescente, depois nome, com nome nulo por último', () => {
        const items = [
            { amountCents: 100n, name: 'Bruno' },
            { amountCents: 100n, name: null },
            { amountCents: 300n, name: 'Zeca' },
            { amountCents: 100n, name: 'Ana' }
        ];

        expect([...items].sort(compareByAmountThenName).map(item => item.name)).toEqual(['Zeca', 'Ana', 'Bruno', null]);
    });
});
