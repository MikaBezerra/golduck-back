import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { SummaryRepository } from '../repository/summary.repository.js';

type GroupByArgs = { by: string[] };
type GroupRow = {
    month: Date;
    categoryId?: string;
    personId?: string | null;
    _sum: { amountCents: bigint | null };
    _count: { _all: number };
};

type AmountRow = { amountCents: bigint };
type SumRow = { _sum: { amountCents: bigint | null } };
type CardRow = { id: string; cardId: string; amountCents: bigint; personId: string | null };

const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const DECEMBER = new Date('2026-12-01T00:00:00.000Z');
const JANUARY = new Date('2027-01-01T00:00:00.000Z');
const FEBRUARY = new Date('2027-02-01T00:00:00.000Z');

const row = (month: Date, key: { categoryId: string } | { personId: string | null }, amountCents: bigint | null, count: number): GroupRow => ({
    month,
    ...key,
    _sum: { amountCents },
    _count: { _all: count }
});

/*
 * O repositório monta as consultas do Prisma (intervalo de meses, sem as despesas do cartão
 * excluídas) e distribui as linhas agrupadas pelo banco nos meses pedidos.
 */
describe('SummaryRepository', () => {
    let incomes: Array<{ month: Date; amountCents: bigint }>;
    let reserves: Array<{ month: Date; amountCents: bigint }>;
    let manualRows: { byCategory: GroupRow[]; byPerson: GroupRow[] };
    let cardRows: { byCategory: GroupRow[]; byPerson: GroupRow[] };

    const groupRows = (rows: () => { byCategory: GroupRow[]; byPerson: GroupRow[] }) =>
        async (args: GroupByArgs): Promise<GroupRow[]> => Promise.resolve(args.by[1] === 'categoryId' ? rows().byCategory : rows().byPerson);
    const prisma = {
        monthlyIncome: {
            findMany: jest.fn(async () => Promise.resolve(incomes)),
            findUnique: jest.fn(async (): Promise<AmountRow | null> => Promise.resolve(null))
        },
        monthlyReserve: {
            findMany: jest.fn(async () => Promise.resolve(reserves)),
            findUnique: jest.fn(async (): Promise<AmountRow | null> => Promise.resolve(null)),
            aggregate: jest.fn(async (): Promise<SumRow> => Promise.resolve({ _sum: { amountCents: null } }))
        },
        manualExpense: {
            groupBy: jest.fn(groupRows(() => manualRows)),
            findMany: jest.fn(async (): Promise<unknown[]> => Promise.resolve([]))
        },
        cardExpense: {
            groupBy: jest.fn(groupRows(() => cardRows)),
            findMany: jest.fn(async (): Promise<CardRow[]> => Promise.resolve([]))
        },
        creditCard: { findMany: jest.fn(async () => Promise.resolve([{ id: 'nubank', name: 'Nubank' }])) },
        category: { findMany: jest.fn(async () => Promise.resolve([])) },
        person: { findMany: jest.fn(async (): Promise<unknown[]> => Promise.resolve([])) }
    };
    const repository = new SummaryRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
        incomes = [];
        reserves = [];
        manualRows = { byCategory: [], byPerson: [] };
        cardRows = { byCategory: [], byPerson: [] };
    });

    describe('loadMonths', () => {
        it('consulta do 1º dia do mês inicial até antes do mês seguinte ao último, sem as despesas do cartão excluídas', async () => {
            await repository.loadMonths(NOVEMBER, 2);

            const range = { gte: NOVEMBER, lt: JANUARY };
            const aggregates = { _sum: { amountCents: true }, _count: { _all: true } };

            expect(prisma.monthlyIncome.findMany).toHaveBeenCalledWith({ where: { month: range }, select: { month: true, amountCents: true } });
            expect(prisma.monthlyReserve.findMany).toHaveBeenCalledWith({ where: { month: range }, select: { month: true, amountCents: true } });
            expect(prisma.manualExpense.groupBy).toHaveBeenCalledTimes(2);
            expect(prisma.manualExpense.groupBy).toHaveBeenCalledWith({ by: ['month', 'categoryId'], where: { month: range }, ...aggregates });
            expect(prisma.manualExpense.groupBy).toHaveBeenCalledWith({ by: ['month', 'personId'], where: { month: range }, ...aggregates });
            expect(prisma.cardExpense.groupBy).toHaveBeenCalledTimes(2);
            expect(prisma.cardExpense.groupBy).toHaveBeenCalledWith({
                by: ['month', 'categoryId'], where: { month: range, excludedAt: null }, ...aggregates
            });
            expect(prisma.cardExpense.groupBy).toHaveBeenCalledWith({
                by: ['month', 'personId'], where: { month: range, excludedAt: null }, ...aggregates
            });
        });

        it('um mês só: o intervalo termina no 1º dia do mês seguinte', async () => {
            await repository.loadMonths(DECEMBER, 1);

            expect(prisma.monthlyIncome.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { month: { gte: DECEMBER, lt: JANUARY } } }));
        });

        it('distribui as linhas em cada mês, na ordem dos meses; mês sem nada vem vazio', async () => {
            incomes = [{ month: DECEMBER, amountCents: 300_000n }, { month: NOVEMBER, amountCents: 100_000n }];
            reserves = [{ month: DECEMBER, amountCents: 5_000n }];
            manualRows = {
                byCategory: [row(DECEMBER, { categoryId: 'casa' }, 700n, 2), row(NOVEMBER, { categoryId: 'casa' }, 100n, 1)],
                byPerson: [row(NOVEMBER, { personId: null }, 100n, 1), row(DECEMBER, { personId: 'ana' }, 700n, 2)]
            };
            cardRows = {
                byCategory: [row(NOVEMBER, { categoryId: 'lazer' }, 250n, 3)],
                byPerson: [row(NOVEMBER, { personId: 'bruno' }, 250n, 3)]
            };

            const months = await repository.loadMonths(NOVEMBER, 3);

            expect(months).toEqual([
                {
                    incomeCents: 100_000n,
                    reserveCents: null,
                    manualByCategory: [{ key: 'casa', amountCents: 100n, count: 1 }],
                    manualByPerson: [{ key: null, amountCents: 100n, count: 1 }],
                    cardByCategory: [{ key: 'lazer', amountCents: 250n, count: 3 }],
                    cardByPerson: [{ key: 'bruno', amountCents: 250n, count: 3 }]
                },
                {
                    incomeCents: 300_000n,
                    reserveCents: 5_000n,
                    manualByCategory: [{ key: 'casa', amountCents: 700n, count: 2 }],
                    manualByPerson: [{ key: 'ana', amountCents: 700n, count: 2 }],
                    cardByCategory: [],
                    cardByPerson: []
                },
                {
                    incomeCents: null,
                    reserveCents: null,
                    manualByCategory: [],
                    manualByPerson: [],
                    cardByCategory: [],
                    cardByPerson: []
                }
            ]);
            expect(prisma.monthlyIncome.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { month: { gte: NOVEMBER, lt: FEBRUARY } } }));
        });

        it('soma vazia do banco (null) vira zero centavos', async () => {
            manualRows = { byCategory: [row(NOVEMBER, { categoryId: 'casa' }, null, 0)], byPerson: [] };

            const [november] = await repository.loadMonths(NOVEMBER, 1);

            expect(november.manualByCategory).toEqual([{ key: 'casa', amountCents: 0n, count: 0 }]);
        });
    });

    describe('findCategories', () => {
        it('busca as categorias pelos ids', async () => {
            await repository.findCategories(['casa', 'lazer']);

            expect(prisma.category.findMany).toHaveBeenCalledWith({ where: { id: { in: ['casa', 'lazer'] } } });
        });

        it('sem ids, devolve lista vazia sem ir ao banco', async () => {
            await expect(repository.findCategories([])).resolves.toEqual([]);
            expect(prisma.category.findMany).not.toHaveBeenCalled();
        });
    });

    describe('findPeople', () => {
        it('busca as pessoas pelos ids e também todas as ativas (mesmo sem ids)', async () => {
            await repository.findPeople(['ana']);
            await repository.findPeople([]);

            expect(prisma.person.findMany).toHaveBeenNthCalledWith(1, { where: { OR: [{ id: { in: ['ana'] } }, { active: true }] } });
            expect(prisma.person.findMany).toHaveBeenNthCalledWith(2, { where: { OR: [{ id: { in: [] } }, { active: true }] } });
        });
    });

    describe('loadStatementSource', () => {
        it('lê o mês (cartão sem as excluídas), a reserva acumulada até ele e só os cartões das despesas', async () => {
            const card = { id: 'c1', cardId: 'nubank', amountCents: 500n, personId: null };
            prisma.monthlyIncome.findUnique.mockResolvedValueOnce({ amountCents: 100_000n });
            prisma.monthlyReserve.findUnique.mockResolvedValueOnce({ amountCents: 5_000n });
            prisma.monthlyReserve.aggregate.mockResolvedValueOnce({ _sum: { amountCents: 25_000n } });
            prisma.person.findMany.mockResolvedValueOnce([{ id: 'ana', name: 'Ana', active: true }]);
            prisma.cardExpense.findMany.mockResolvedValueOnce([card, { ...card, id: 'c2' }]);

            const result = await repository.loadStatementSource(NOVEMBER);

            expect(result).toEqual({
                month: NOVEMBER,
                incomeCents: 100_000n,
                reserveCents: 5_000n,
                reserveAccumulatedCents: 25_000n,
                people: [{ id: 'ana', name: 'Ana', active: true }],
                manualExpenses: [],
                cardExpenses: [card, { ...card, id: 'c2' }],
                cards: [{ id: 'nubank', name: 'Nubank' }]
            });
            expect(prisma.monthlyReserve.aggregate).toHaveBeenCalledWith({ where: { month: { lt: DECEMBER } }, _sum: { amountCents: true } });
            expect(prisma.manualExpense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { month: { gte: NOVEMBER, lt: DECEMBER } } }));
            expect(prisma.cardExpense.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { month: { gte: NOVEMBER, lt: DECEMBER }, excludedAt: null }
            }));
            expect(prisma.creditCard.findMany).toHaveBeenCalledWith({ where: { id: { in: ['nubank'] } }, select: { id: true, name: true } });
        });

        it('mês vazio: entrada e reserva null, acumulado zero e sem consultar cartões', async () => {
            const result = await repository.loadStatementSource(NOVEMBER);

            expect(result).toMatchObject({ incomeCents: null, reserveCents: null, reserveAccumulatedCents: 0n, cards: [] });
            expect(prisma.creditCard.findMany).not.toHaveBeenCalled();
        });
    });
});
