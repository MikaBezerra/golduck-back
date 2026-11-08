import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { CreditCardRepository } from '../repository/credit-card.repository.js';

/*
 * O repositório só monta consultas do Prisma; o teste confere o filtro e a ordenação pedidos
 * (é aí que mora a regra "só ativos, por nome").
 */
describe('CreditCardRepository', () => {
    const prisma = {
        creditCard: {
            create: jest.fn(async () => Promise.resolve({})),
            findMany: jest.fn(async () => Promise.resolve([])),
            findUnique: jest.fn(async () => Promise.resolve(null)),
            update: jest.fn(async () => Promise.resolve({}))
        },
        cardBill: {
            findMany: jest.fn(async () => Promise.resolve([])),
            upsert: jest.fn(async () => Promise.resolve({}))
        },
        cardExpense: {
            groupBy: jest.fn(async () => Promise.resolve([]))
        },
        $transaction: jest.fn(async () => Promise.resolve())
    };
    const repository = new CreditCardRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('findAll: só ativos, por nome e, no empate, por id (ordem estável)', async () => {
        const rows = [{ id: 'id-1' }];
        prisma.creditCard.findMany.mockResolvedValueOnce(rows as never);

        await expect(repository.findAll()).resolves.toBe(rows);
        expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
            where: { active: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }]
        });
    });

    it('busca por id', async () => {
        await repository.findById('id-1');

        expect(prisma.creditCard.findUnique).toHaveBeenCalledWith({ where: { id: 'id-1' } });
    });

    it('cria e altera com os campos recebidos', async () => {
        await repository.create({ name: 'Nubank', bank: 'NUBANK' });
        await repository.update('id-1', { name: 'Nubank Ayanne', active: false });

        expect(prisma.creditCard.create).toHaveBeenCalledWith({ data: { name: 'Nubank', bank: 'NUBANK' } });
        expect(prisma.creditCard.update).toHaveBeenCalledWith({ where: { id: 'id-1' }, data: { name: 'Nubank Ayanne', active: false } });
    });

    it('updateSyncState grava a situação da sincronização no cartão', async () => {
        await repository.updateSyncState('id-1', { syncStatus: 'UPDATED', syncError: null });

        expect(prisma.creditCard.update).toHaveBeenCalledWith({ where: { id: 'id-1' }, data: { syncStatus: 'UPDATED', syncError: null } });
    });

    it('faturas: lista por mês, ajuste do usuário e datas do banco por upsert (cardId + mês)', async () => {
        const month = new Date('2026-11-01T00:00:00.000Z');
        const closingDate = new Date('2026-10-22T00:00:00.000Z');
        const dueDate = new Date('2026-11-03T00:00:00.000Z');
        const tx = { cardBill: { upsert: jest.fn(async () => Promise.resolve({})) } };
        prisma.$transaction.mockImplementationOnce((async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never);

        await repository.findBills('id-1');
        await repository.saveBestPurchaseDate('id-1', month, null);
        await repository.saveBankDates('id-1', [{ month, closingDate, dueDate }]);

        expect(prisma.cardBill.findMany).toHaveBeenCalledWith({ where: { cardId: 'id-1' }, orderBy: { month: 'asc' } });
        expect(prisma.cardBill.upsert).toHaveBeenCalledWith({
            where: { cardId_month: { cardId: 'id-1', month } },
            create: { cardId: 'id-1', month, bestPurchaseDate: null },
            update: { bestPurchaseDate: null }
        });
        expect(tx.cardBill.upsert).toHaveBeenCalledWith({
            where: { cardId_month: { cardId: 'id-1', month } },
            create: { cardId: 'id-1', month, bankClosingDate: closingDate, bankDueDate: dueDate },
            update: { bankClosingDate: closingDate, bankDueDate: dueDate }
        });
    });

    it('savePayment grava o pagamento por upsert (cardId + mês)', async () => {
        const month = new Date('2026-11-01T00:00:00.000Z');
        const paidAt = new Date('2026-11-30T15:00:00.000Z');

        await repository.savePayment('id-1', month, { paidAt, paidAmountCents: 100n });

        expect(prisma.cardBill.upsert).toHaveBeenCalledWith({
            where: { cardId_month: { cardId: 'id-1', month } },
            create: { cardId: 'id-1', month, paidAt, paidAmountCents: 100n },
            update: { paidAt, paidAmountCents: 100n }
        });
    });

    it('sumBillTotals soma as compras não excluídas por cartão e mês (sem compras, zero)', async () => {
        const month = new Date('2026-11-01T00:00:00.000Z');
        prisma.cardExpense.groupBy.mockResolvedValueOnce([
            { cardId: 'id-1', month, _sum: { amountCents: 1500n } },
            { cardId: 'id-2', month, _sum: { amountCents: null } }
        ] as never);

        await expect(repository.sumBillTotals({ month })).resolves.toEqual([
            { cardId: 'id-1', month, totalCents: 1500n },
            { cardId: 'id-2', month, totalCents: 0n }
        ]);
        expect(prisma.cardExpense.groupBy).toHaveBeenCalledWith({
            by: ['cardId', 'month'],
            where: { excludedAt: null, cardId: undefined, month },
            _sum: { amountCents: true }
        });

        await repository.sumBillTotals({ cardId: 'id-1', fromMonth: month });
        await repository.sumBillTotals({});

        expect(prisma.cardExpense.groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({
            where: { excludedAt: null, cardId: 'id-1', month: { gte: month } }
        }));
        expect(prisma.cardExpense.groupBy).toHaveBeenNthCalledWith(3, expect.objectContaining({
            where: { excludedAt: null, cardId: undefined, month: undefined }
        }));
    });

    it('resumo: cartões ativos ou dos ids pedidos, por nome; faturas dos cartões pedidos', async () => {
        await repository.findActiveOrIn(['id-9']);
        await repository.findBillsOfCards(['id-1', 'id-2']);

        expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
            where: { OR: [{ active: true }, { id: { in: ['id-9'] } }] },
            orderBy: [{ name: 'asc' }, { id: 'asc' }]
        });
        expect(prisma.cardBill.findMany).toHaveBeenCalledWith({ where: { cardId: { in: ['id-1', 'id-2'] } }, orderBy: { month: 'asc' } });
    });
});
