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
        reserveCents: null,
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

    describe('reserva', () => {
        // entrada 1000, compartilhadas 300, reserva 101, Mikaell com 100 de individual
        const withReserve = computeMonth(month({
            incomeCents: 1000n,
            reserveCents: 101n,
            manualByCategory: [{ key: 'casa', amountCents: 400n, count: 2 }],
            manualByPerson: [{ key: null, amountCents: 300n, count: 1 }, { key: 'b', amountCents: 100n, count: 1 }]
        }), people);

        it('fica fora das despesas, mas sai do saldo', () => {
            expect(withReserve).toMatchObject({ reserveCents: 101n, expensesCents: 400n, expensesCount: 2, balanceCents: 499n });
        });

        it('entra na divisão como gasto compartilhado: (1000 − 300 − 101) / 2, centavo extra para Ayanne', () => {
            expect(withReserve.nets.map(net => [net.participant.name, net.shareCents, net.individualCents, net.netCents])).toEqual([
                ['Ayanne', 300n, 0n, 300n],
                ['Mikaell', 299n, 100n, 199n]
            ]);
            expect(withReserve.nets.reduce((sum, net) => sum + net.netCents, 0n)).toBe(withReserve.balanceCents);
        });

        it('reserva sem entrada deixa saldo e partes negativos', () => {
            const onlyReserve = computeMonth(month({ reserveCents: 500n }), people);

            expect(onlyReserve.balanceCents).toBe(-500n);
            expect(onlyReserve.nets.map(net => net.shareCents)).toEqual([-250n, -250n]);
        });

        it('no período, soma as reservas e é null se nenhum mês tiver reserva', () => {
            const year = combinePeriods([withReserve, march, computeMonth(month({ reserveCents: 50n }), people)], people);

            expect(year.reserveCents).toBe(151n);
            expect(year.balanceCents).toBe(499n - 50n);
            expect(year.nets.map(net => net.netCents)).toEqual([300n - 25n, 199n - 25n]);
            expect(combinePeriods([march, march], people).reserveCents).toBeNull();
        });
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

describe('compareByAmountThenName (comparações diretas)', () => {
    const item = (amountCents: bigint, name: string | null): { amountCents: bigint; name: string | null } => ({ amountCents, name });

    it('valor maior vem antes, independentemente do nome', () => {
        expect(compareByAmountThenName(item(200n, 'Zeca'), item(100n, 'Ana'))).toBe(-1);
        expect(compareByAmountThenName(item(100n, 'Ana'), item(200n, 'Zeca'))).toBe(1);
        expect(compareByAmountThenName(item(200n, null), item(100n, 'Ana'))).toBe(-1);
    });

    it('mesmo valor: ordem alfabética nos dois sentidos e zero para o mesmo nome', () => {
        expect(compareByAmountThenName(item(100n, 'Ana'), item(100n, 'Bruno'))).toBeLessThan(0);
        expect(compareByAmountThenName(item(100n, 'Zeca'), item(100n, 'Ana'))).toBeGreaterThan(0);
        expect(compareByAmountThenName(item(100n, 'Ana'), item(100n, 'Ana'))).toBe(0);
    });

    it('mesmo valor: sem nome (null) fica depois de qualquer nome, e dois null empatam', () => {
        expect(compareByAmountThenName(item(100n, null), item(100n, 'Ana'))).toBe(1);
        expect(compareByAmountThenName(item(100n, 'Zeca'), item(100n, null))).toBe(-1);
        expect(compareByAmountThenName(item(100n, 'Ana'), item(100n, null))).toBe(-1);
        expect(compareByAmountThenName(item(100n, null), item(100n, null))).toBe(0);
    });

    it('lista já ordenada continua na mesma ordem', () => {
        const items = [item(100n, 'Ana'), item(100n, 'Bruno'), item(100n, null)];

        expect([...items].sort(compareByAmountThenName).map(sorted => sorted.name)).toEqual(['Ana', 'Bruno', null]);
    });
});

describe('ordem das pessoas na divisão', () => {
    it('segue o nome (não o id) e, com nomes iguais, desempata pelo id', () => {
        const people = [
            { id: 'a', name: 'Zeca' },
            { id: 'z', name: 'Ana' },
            { id: 'b', name: 'Ana' }
        ];

        // 5 centavos para 3 pessoas: os 2 que sobram vão para as duas primeiras.
        const result = netByParticipant(5n, 0n, people, new Map());

        expect(result.map(net => [net.participant.id, net.shareCents])).toEqual([
            ['b', 2n],
            ['z', 2n],
            ['a', 1n]
        ]);
    });

    it('combinePeriods lista as pessoas na mesma ordem', () => {
        const people = [{ id: 'a', name: 'Zeca' }, { id: 'z', name: 'Ana' }];
        const empty: MonthGroups = {
            incomeCents: null,
            reserveCents: null,
            manualByCategory: [],
            manualByPerson: [],
            cardByCategory: [],
            cardByPerson: []
        };
        const period = combinePeriods([computeMonth(empty, people)], people);

        expect(period.nets.map(net => net.participant.name)).toEqual(['Ana', 'Zeca']);
        expect(period.manual).toEqual({ amountCents: 0n, count: 0 });
    });
});
