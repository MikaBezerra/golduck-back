import {
    combinePeriods,
    compareByAmountThenName,
    computeMonth,
    mergeGroups,
    MonthGroups,
    netByParticipant,
    splitEvenly
} from '../service/summary.calculator';

describe('computeMonth e combinePeriods', () => {
    const people = [{ id: 'b', name: 'Mikaell' }, { id: 'a', name: 'Ayanne' }];
    const month = (overrides: Partial<MonthGroups>): MonthGroups => ({
        incomeCents: null,
        manualByCategory: [],
        manualByPerson: [],
        cardByCategory: [],
        cardByPerson: [],
        ...overrides
    });
    const january = computeMonth(month({
        incomeCents: 1001n,
        manualByCategory: [{ key: 'casa', amountCents: 300n, count: 1 }],
        manualByPerson: [{ key: null, amountCents: 300n, count: 1 }],
        cardByCategory: [{ key: 'casa', amountCents: 100n, count: 2 }],
        cardByPerson: [{ key: 'b', amountCents: 100n, count: 2 }]
    }), people);
    const february = computeMonth(month({
        incomeCents: 1001n,
        manualByCategory: [{ key: 'lazer', amountCents: 1n, count: 1 }],
        manualByPerson: [{ key: null, amountCents: 1n, count: 1 }]
    }), people);
    const march = computeMonth(month({}), people);

    it('calcula o mês: totais, saldo e líquido com o centavo extra para a primeira em ordem alfabética', () => {
        expect(january).toMatchObject({ expensesCents: 400n, expensesCount: 3, balanceCents: 601n });
        expect(january.nets.map(net => [net.participant.name, net.shareCents, net.netCents])).toEqual([
            ['Ayanne', 351n, 351n],
            ['Mikaell', 350n, 250n]
        ]);
    });

    it('soma os meses; o líquido do período é a soma dos líquidos mensais', () => {
        const year = combinePeriods([january, february, march], people);

        expect(year).toMatchObject({ incomeCents: 2002n, expensesCents: 401n, expensesCount: 4, balanceCents: 1601n });
        expect(year.byCategory).toEqual([
            { key: 'casa', amountCents: 400n, count: 3 },
            { key: 'lazer', amountCents: 1n, count: 1 }
        ]);
        // fevereiro: (1001 − 1) / 2 = 500 para cada, sem centavo extra
        expect(year.nets.map(net => [net.participant.name, net.shareCents, net.individualCents, net.netCents])).toEqual([
            ['Ayanne', 851n, 0n, 851n],
            ['Mikaell', 850n, 100n, 750n]
        ]);
    });

    it('sem entrada em nenhum mês, a entrada do período é null', () => {
        expect(combinePeriods([march, march], people).incomeCents).toBeNull();
    });
});

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
