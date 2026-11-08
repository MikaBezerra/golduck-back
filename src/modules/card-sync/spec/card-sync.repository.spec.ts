import type { PrismaService } from '../../common/index.js';
import type { CardSyncPlan } from '../service/card-sync.planner.js';
import { jest } from '@jest/globals';

import { CardSyncRepository } from '../repository/card-sync.repository.js';

const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');

/* O repositório só monta consultas do Prisma; o teste confere o contexto lido e as gravações, na mesma transação. */
describe('CardSyncRepository', () => {
    const tx = {
        cardExpense: {
            findMany: jest.fn(async () => Promise.resolve([{ id: 'existente' }])),
            deleteMany: jest.fn(async () => Promise.resolve({ count: 1 })),
            update: jest.fn(async () => Promise.resolve({})),
            createMany: jest.fn(async () => Promise.resolve({ count: 1 }))
        },
        cardPurchaseCorrection: {
            findMany: jest.fn(async () => Promise.resolve([{ purchaseKey: 'P|x' }]))
        }
    };
    const prisma = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
            expect(options).toEqual({ timeout: 30_000 });
            return callback(tx);
        })
    };
    const repository = new CardSyncRepository(prisma as unknown as PrismaService);
    const emptyPlan: CardSyncPlan = {
        deleteIds: [], updates: [], creates: [], summary: { created: 0, updated: 0, unchanged: 0, removed: 0, replacedManual: 0 }
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lê as linhas a partir do mês inicial e as das compras sincronizadas, as correções, e grava o plano', async () => {
        const plan = jest.fn(() => ({
            ...emptyPlan,
            deleteIds: ['velha'],
            updates: [{ id: 'u1', data: { amountCents: 100n } }],
            creates: [{ purchaseKey: 'nova' }]
        }) as unknown as CardSyncPlan);

        await repository.apply({ cardId: 'cartao-1', syncFromMonth: NOVEMBER, purchaseKeys: ['A', 'B'] }, plan);

        expect(tx.cardExpense.findMany).toHaveBeenCalledWith({
            where: { cardId: 'cartao-1', OR: [{ month: { gte: NOVEMBER } }, { purchaseKey: { in: ['A', 'B'] } }] }
        });
        expect(tx.cardPurchaseCorrection.findMany).toHaveBeenCalledWith({ where: { cardId: 'cartao-1' } });
        expect(plan).toHaveBeenCalledWith({ existing: [{ id: 'existente' }], corrections: [{ purchaseKey: 'P|x' }] });
        expect(tx.cardExpense.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['velha'] } } });
        expect(tx.cardExpense.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { amountCents: 100n } });
        expect(tx.cardExpense.createMany).toHaveBeenCalledWith({ data: [{ purchaseKey: 'nova' }] });
    });

    it('plano vazio não grava nada', async () => {
        await repository.apply({ cardId: 'cartao-1', syncFromMonth: NOVEMBER, purchaseKeys: [] }, () => emptyPlan);

        expect(tx.cardExpense.deleteMany).not.toHaveBeenCalled();
        expect(tx.cardExpense.update).not.toHaveBeenCalled();
        expect(tx.cardExpense.createMany).not.toHaveBeenCalled();
    });
});
