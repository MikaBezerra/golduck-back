import type { CardExpense } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { CardExpenseRepository, NewCardExpenseRow } from '../repository/card-expense.repository.js';

const OCTOBER = new Date('2026-10-01T00:00:00.000Z');
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const NOW = new Date('2026-11-07T12:00:00.000Z');
const ORDER_BY = [{ month: 'asc' }, { transactionDate: 'asc' }, { originalDescription: 'asc' }, { id: 'asc' }];

/** Só os campos que o repositório lê para montar os filtros. */
const expense = (data: Pick<CardExpense, 'id' | 'cardId' | 'purchaseKey' | 'month' | 'installmentTotal'>): CardExpense =>
    data as CardExpense;

const SINGLE = expense({ id: 'avista-1', cardId: 'cartao-1', purchaseKey: 'S|compra', month: OCTOBER, installmentTotal: null });
const INSTALLMENT = expense({ id: 'parcela-2', cardId: 'cartao-1', purchaseKey: 'P|2026-09|4|TV', month: NOVEMBER, installmentTotal: 4 });

/*
 * O repositório só monta consultas do Prisma; o teste confere filtros, ordenação e o que vai junto
 * numa transação (é aí que moram "parcelas seguintes", o escopo da exclusão e a restauração).
 */
describe('CardExpenseRepository', () => {
    const tx = {
        cardExpense: {
            updateMany: jest.fn(async () => Promise.resolve({ count: 0 })),
            findMany: jest.fn(async (): Promise<Array<{ id: string }>> => Promise.resolve([])),
            createMany: jest.fn(async () => Promise.resolve({ count: 1 })),
            deleteMany: jest.fn(async () => Promise.resolve({ count: 1 }))
        },
        cardPurchaseCorrection: {
            upsert: jest.fn(async () => Promise.resolve({}))
        }
    };
    const prisma = {
        cardExpense: {
            findMany: jest.fn(async () => Promise.resolve([{ id: 'listada' }])),
            findUnique: jest.fn(async () => Promise.resolve(null)),
            // Devolve um marcador (no Prisma real, uma PrismaPromise que só roda no $transaction).
            updateMany: jest.fn((args: { data: Record<string, unknown> }) => ({ batch: Object.keys(args.data).join() }))
        },
        $transaction: jest.fn(async (arg: unknown): Promise<unknown> =>
            typeof arg === 'function' ? (arg as (client: typeof tx) => Promise<unknown>)(tx) : Promise.resolve(arg))
    };
    const repository = new CardExpenseRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('consultas', () => {
        it('findAll sem includeExcluded: só as não excluídas do mês (e do cartão, se vier), na ordem da fatura', async () => {
            await expect(repository.findAll({ month: OCTOBER, includeExcluded: false })).resolves.toEqual([{ id: 'listada' }]);
            await repository.findAll({ month: OCTOBER, cardId: 'cartao-1', includeExcluded: false });

            expect(prisma.cardExpense.findMany).toHaveBeenNthCalledWith(1, {
                where: { month: OCTOBER, cardId: undefined, excludedAt: null },
                orderBy: ORDER_BY
            });
            expect(prisma.cardExpense.findMany).toHaveBeenNthCalledWith(2, {
                where: { month: OCTOBER, cardId: 'cartao-1', excludedAt: null },
                orderBy: ORDER_BY
            });
        });

        it('findAll com includeExcluded: não filtra por excludedAt', async () => {
            await repository.findAll({ month: OCTOBER, cardId: 'cartao-1', includeExcluded: true });

            expect(prisma.cardExpense.findMany).toHaveBeenCalledWith({ where: { month: OCTOBER, cardId: 'cartao-1' }, orderBy: ORDER_BY });
        });

        it('findById e findByIds buscam pelos ids', async () => {
            await repository.findById('id-1');
            await repository.findByIds(['id-1', 'id-2']);

            expect(prisma.cardExpense.findUnique).toHaveBeenCalledWith({ where: { id: 'id-1' } });
            expect(prisma.cardExpense.findMany).toHaveBeenCalledWith({ where: { id: { in: ['id-1', 'id-2'] } } });
        });
    });

    describe('updateWithFollowingInstallments', () => {
        it('à vista, só a linha; parcelada, a parcela e as seguintes da mesma compra; altera e relê na mesma transação', async () => {
            const changes = { nickname: 'TV da sala', personId: null };
            const where = {
                OR: [
                    { id: 'avista-1' },
                    { cardId: 'cartao-1', purchaseKey: 'P|2026-09|4|TV', month: { gte: NOVEMBER } }
                ]
            };
            tx.cardExpense.findMany.mockResolvedValueOnce([{ id: 'avista-1' }, { id: 'parcela-2' }]);

            const result = await repository.updateWithFollowingInstallments([SINGLE, INSTALLMENT], changes);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(tx.cardExpense.updateMany).toHaveBeenCalledWith({ where, data: changes });
            expect(tx.cardExpense.findMany).toHaveBeenCalledWith({ where, orderBy: ORDER_BY });
            expect(tx.cardExpense.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.cardExpense.findMany.mock.invocationCallOrder[0]);
            expect(result).toEqual([{ id: 'avista-1' }, { id: 'parcela-2' }]);
        });
    });

    describe('exclude', () => {
        beforeEach(() => {
            jest.useFakeTimers({ now: NOW });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('marca a data só de quem ainda não estava excluída e zera o "não perguntar de novo" de todas, numa transação', async () => {
            await repository.exclude([SINGLE, INSTALLMENT], 'forward');

            const where = {
                OR: [
                    { id: 'avista-1' },
                    { cardId: 'cartao-1', purchaseKey: 'P|2026-09|4|TV', month: { gte: NOVEMBER } }
                ]
            };
            expect(prisma.cardExpense.updateMany).toHaveBeenNthCalledWith(1, { where: { ...where, excludedAt: null }, data: { excludedAt: NOW } });
            expect(prisma.cardExpense.updateMany).toHaveBeenNthCalledWith(2, { where, data: { exclusionRemembered: false } });
            expect(prisma.$transaction).toHaveBeenCalledWith([{ batch: 'excludedAt' }, { batch: 'exclusionRemembered' }]);
        });

        it.each([
            ['month', { equals: NOVEMBER }],
            ['backward', { lte: NOVEMBER }],
            ['all', undefined]
        ] as const)('escopo %s: filtra as parcelas da compra por %j', async (scope, month) => {
            await repository.exclude([INSTALLMENT], scope);

            expect(prisma.cardExpense.updateMany).toHaveBeenNthCalledWith(2, {
                where: { OR: [{ cardId: 'cartao-1', purchaseKey: 'P|2026-09|4|TV', month }] },
                data: { exclusionRemembered: false }
            });
        });

        it('compra à vista ignora o escopo: só a própria linha', async () => {
            await repository.exclude([SINGLE], 'all');

            expect(prisma.cardExpense.updateMany).toHaveBeenNthCalledWith(2, { where: { OR: [{ id: 'avista-1' }] }, data: { exclusionRemembered: false } });
        });
    });

    describe('restore', () => {
        it('acha as excluídas do escopo, desfaz a exclusão só delas e devolve as restauradas, numa transação', async () => {
            tx.cardExpense.findMany
                .mockResolvedValueOnce([{ id: 'parcela-1' }, { id: 'parcela-2' }])
                .mockResolvedValueOnce([{ id: 'parcela-1' }, { id: 'parcela-2' }]);

            const result = await repository.restore([INSTALLMENT], 'backward');

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(tx.cardExpense.findMany).toHaveBeenNthCalledWith(1, {
                where: {
                    OR: [{ cardId: 'cartao-1', purchaseKey: 'P|2026-09|4|TV', month: { lte: NOVEMBER } }],
                    excludedAt: { not: null }
                },
                select: { id: true }
            });
            expect(tx.cardExpense.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ['parcela-1', 'parcela-2'] } },
                data: { excludedAt: null, exclusionRemembered: false }
            });
            expect(tx.cardExpense.findMany).toHaveBeenNthCalledWith(2, { where: { id: { in: ['parcela-1', 'parcela-2'] } }, orderBy: ORDER_BY });
            expect(result).toEqual([{ id: 'parcela-1' }, { id: 'parcela-2' }]);
        });

        it('compra à vista: procura só a própria linha', async () => {
            await repository.restore([SINGLE], 'forward');

            expect(tx.cardExpense.findMany).toHaveBeenNthCalledWith(1, {
                where: { OR: [{ id: 'avista-1' }], excludedAt: { not: null } },
                select: { id: true }
            });
            expect(tx.cardExpense.updateMany).toHaveBeenCalledWith({ where: { id: { in: [] } }, data: { excludedAt: null, exclusionRemembered: false } });
        });
    });

    describe('compras inteiras ("Adicionar compra" e mover de fatura)', () => {
        const purchase = { cardId: 'cartao-1', purchaseKey: 'P|2026-09-10|5|LOJA' };
        const row = { ...purchase, month: NOVEMBER } as unknown as NewCardExpenseRow;

        it('findPurchase busca todas as parcelas da compra, na ordem da fatura', async () => {
            await repository.findPurchase('cartao-1', 'P|2026-09-10|5|LOJA');

            expect(prisma.cardExpense.findMany).toHaveBeenCalledWith({ where: purchase, orderBy: ORDER_BY });
        });

        it('createPurchase grava as linhas e devolve as da compra, numa transação', async () => {
            await repository.createPurchase([row]);

            expect(tx.cardExpense.createMany).toHaveBeenCalledWith({ data: [row] });
            expect(tx.cardExpense.findMany).toHaveBeenCalledWith({ where: purchase, orderBy: ORDER_BY });
        });

        it('replacePurchase troca as linhas da compra e grava a correção por upsert (cartão + compra)', async () => {
            const correction = { installmentNumber: 1, installmentTotal: 5, month: NOVEMBER };

            await repository.replacePurchase(purchase, [row], correction);

            expect(tx.cardExpense.deleteMany).toHaveBeenCalledWith({ where: purchase });
            expect(tx.cardExpense.createMany).toHaveBeenCalledWith({ data: [row] });
            expect(tx.cardPurchaseCorrection.upsert).toHaveBeenCalledWith({
                where: { cardId_purchaseKey: purchase },
                create: { ...purchase, ...correction },
                update: correction
            });
        });

        it('replacePurchase sem linhas e sem correção só apaga', async () => {
            await repository.replacePurchase(purchase, [], null);

            expect(tx.cardExpense.deleteMany).toHaveBeenCalledWith({ where: purchase });
            expect(tx.cardExpense.createMany).not.toHaveBeenCalled();
            expect(tx.cardPurchaseCorrection.upsert).not.toHaveBeenCalled();
        });
    });
});
