import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { ManualExpenseRepository } from '../repository/manual-expense.repository.js';

type WhereId = { where: { id: string } };

/*
 * O repositório só monta consultas do Prisma; o teste confere filtro, ordenação e que as alterações
 * e exclusões em lote vão juntas numa transação (tudo ou nada).
 */
describe('ManualExpenseRepository', () => {
    const prisma = {
        manualExpense: {
            createManyAndReturn: jest.fn(async () => Promise.resolve([{ id: 'criada' }])),
            findMany: jest.fn(async () => Promise.resolve([{ id: 'listada' }])),
            findUnique: jest.fn(async () => Promise.resolve(null)),
            // Devolvem um marcador (no Prisma real, uma PrismaPromise que só roda no $transaction).
            update: jest.fn((args: WhereId) => ({ updated: args.where.id })),
            delete: jest.fn((args: WhereId) => ({ deleted: args.where.id }))
        },
        $transaction: jest.fn(async (operations: unknown[]) => Promise.resolve(operations))
    };
    const repository = new ManualExpenseRepository(prisma as unknown as PrismaService);
    const october = new Date('2026-10-01T00:00:00.000Z');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('createMany grava todas as linhas de uma vez e devolve as criadas', async () => {
        const entries = [
            { month: october, title: 'Internet', amountCents: 9990n, categoryId: 'categoria', personId: null },
            { month: new Date('2026-11-01T00:00:00.000Z'), title: 'Internet', amountCents: 9990n, categoryId: 'categoria', personId: 'pessoa' }
        ];

        await expect(repository.createMany(entries)).resolves.toEqual([{ id: 'criada' }]);

        expect(prisma.manualExpense.createManyAndReturn).toHaveBeenCalledWith({ data: entries });
    });

    it('findAllByMonth filtra pelo mês e ordena por título e depois por id', async () => {
        await expect(repository.findAllByMonth(october)).resolves.toEqual([{ id: 'listada' }]);

        expect(prisma.manualExpense.findMany).toHaveBeenCalledWith({
            where: { month: october },
            orderBy: [{ title: 'asc' }, { id: 'asc' }]
        });
    });

    it('findById busca pela chave primária', async () => {
        await expect(repository.findById('id-1')).resolves.toBeNull();

        expect(prisma.manualExpense.findUnique).toHaveBeenCalledWith({ where: { id: 'id-1' } });
    });

    it('updateManyByIds altera cada id com as mesmas mudanças, todos numa transação', async () => {
        const changes = { title: 'Fibra', amountCents: 12050n };

        const result = await repository.updateManyByIds(['id-1', 'id-2'], changes);

        expect(prisma.manualExpense.update).toHaveBeenNthCalledWith(1, { where: { id: 'id-1' }, data: changes });
        expect(prisma.manualExpense.update).toHaveBeenNthCalledWith(2, { where: { id: 'id-2' }, data: changes });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).toHaveBeenCalledWith([{ updated: 'id-1' }, { updated: 'id-2' }]);
        expect(result).toEqual([{ updated: 'id-1' }, { updated: 'id-2' }]);
    });

    it('deleteManyByIds exclui cada id, todos numa transação', async () => {
        const result = await repository.deleteManyByIds(['id-1', 'id-2']);

        expect(prisma.manualExpense.delete).toHaveBeenNthCalledWith(1, { where: { id: 'id-1' } });
        expect(prisma.manualExpense.delete).toHaveBeenNthCalledWith(2, { where: { id: 'id-2' } });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).toHaveBeenCalledWith([{ deleted: 'id-1' }, { deleted: 'id-2' }]);
        expect(result).toEqual([{ deleted: 'id-1' }, { deleted: 'id-2' }]);
    });

    it('a falha da transação (ex.: id inexistente) chega a quem chamou', async () => {
        const failure = new Error('Record to update not found.');
        prisma.$transaction.mockRejectedValueOnce(failure);

        await expect(repository.updateManyByIds(['id-1'], { title: 'X' })).rejects.toBe(failure);
    });
});
