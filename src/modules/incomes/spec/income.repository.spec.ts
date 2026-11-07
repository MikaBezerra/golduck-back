import type { PrismaService } from '../../common';
import { jest } from '@jest/globals';

import { IncomeRepository } from '../repository/income.repository';

const AUGUST = new Date('2026-08-01T00:00:00.000Z');
const SEPTEMBER = new Date('2026-09-01T00:00:00.000Z');

/*
 * O repositório só monta consultas do Prisma; o teste confere filtros e ordenação pedidos
 * (é aí que mora a regra "meses do ano, em ordem").
 */
describe('IncomeRepository', () => {
    const prisma = {
        monthlyIncome: {
            createManyAndReturn: jest.fn(async () => Promise.resolve([])),
            findMany: jest.fn(async () => Promise.resolve([])),
            findUnique: jest.fn(async () => Promise.resolve(null)),
            update: jest.fn(async () => Promise.resolve({})),
            delete: jest.fn(async () => Promise.resolve({}))
        }
    };
    const repository = new IncomeRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('createMany grava todas as entradas numa instrução só e devolve o que o banco devolveu', async () => {
        const entries = [{ month: AUGUST, amountCents: 100n }, { month: SEPTEMBER, amountCents: 100n }];
        const rows = [{ id: 'id-1' }];
        prisma.monthlyIncome.createManyAndReturn.mockResolvedValueOnce(rows as never);

        await expect(repository.createMany(entries)).resolves.toBe(rows);
        expect(prisma.monthlyIncome.createManyAndReturn).toHaveBeenCalledWith({ data: entries });
    });

    it('findByMonths procura os meses pedidos, em ordem de mês', async () => {
        await repository.findByMonths([SEPTEMBER, AUGUST]);

        expect(prisma.monthlyIncome.findMany).toHaveBeenCalledWith({
            where: { month: { in: [SEPTEMBER, AUGUST] } },
            orderBy: { month: 'asc' }
        });
    });

    it('findAll sem período: todas, em ordem de mês', async () => {
        await repository.findAll();

        expect(prisma.monthlyIncome.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { month: 'asc' } });
    });

    it('findAll com período: do início (inclusive) ao fim (exclusive)', async () => {
        const start = new Date('2026-01-01T00:00:00.000Z');
        const end = new Date('2027-01-01T00:00:00.000Z');

        await repository.findAll({ start, end });

        expect(prisma.monthlyIncome.findMany).toHaveBeenCalledWith({
            where: { month: { gte: start, lt: end } },
            orderBy: { month: 'asc' }
        });
    });

    it('busca, altera e apaga pelo mês', async () => {
        const row = { id: 'id-1', month: AUGUST };
        prisma.monthlyIncome.findUnique.mockResolvedValueOnce(row as never);

        await expect(repository.findByMonth(AUGUST)).resolves.toBe(row);
        await repository.update({ month: AUGUST, amountCents: 150005n });
        await repository.delete(AUGUST);

        expect(prisma.monthlyIncome.findUnique).toHaveBeenCalledWith({ where: { month: AUGUST } });
        expect(prisma.monthlyIncome.update).toHaveBeenCalledWith({ where: { month: AUGUST }, data: { amountCents: 150005n } });
        expect(prisma.monthlyIncome.delete).toHaveBeenCalledWith({ where: { month: AUGUST } });
    });
});
