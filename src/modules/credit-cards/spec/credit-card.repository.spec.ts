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
});
