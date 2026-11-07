import type { PrismaService } from '../../common';
import { jest } from '@jest/globals';

import { CreditCardRepository } from '../repository/credit-card.repository';

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
        }
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
});
