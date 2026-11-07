import type { PrismaService } from '../../common';
import { jest } from '@jest/globals';

import { CategoryRepository } from '../repository/category.repository';

/*
 * O repositório só monta consultas do Prisma; o teste confere o filtro e a ordenação pedidos
 * (é aí que mora a regra "só ativas, em ordem alfabética").
 */
describe('CategoryRepository', () => {
    const prisma = {
        category: {
            create: jest.fn(async () => Promise.resolve({})),
            findMany: jest.fn(async () => Promise.resolve([])),
            findUnique: jest.fn(async () => Promise.resolve(null)),
            findFirst: jest.fn(async () => Promise.resolve(null)),
            update: jest.fn(async () => Promise.resolve({}))
        }
    };
    const repository = new CategoryRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('findAll sem inativas: só ativas, por nome', async () => {
        await repository.findAll(false);

        expect(prisma.category.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { name: 'asc' } });
    });

    it('findAll com inativas: todas, ativas primeiro e depois por nome', async () => {
        await repository.findAll(true);

        expect(prisma.category.findMany).toHaveBeenCalledWith({
            where: undefined,
            orderBy: [{ active: 'desc' }, { name: 'asc' }]
        });
    });

    it('busca por id, pela chave do nome e a padrão', async () => {
        await repository.findById('id-1');
        await repository.findByNameKey('mercado');
        await repository.findDefault();

        expect(prisma.category.findUnique).toHaveBeenNthCalledWith(1, { where: { id: 'id-1' } });
        expect(prisma.category.findUnique).toHaveBeenNthCalledWith(2, { where: { nameKey: 'mercado' } });
        expect(prisma.category.findFirst).toHaveBeenCalledWith({ where: { isDefault: true } });
    });

    it('cria e altera com os campos recebidos', async () => {
        await repository.create('Mercado', 'mercado');
        await repository.update('id-1', { active: false });

        expect(prisma.category.create).toHaveBeenCalledWith({ data: { name: 'Mercado', nameKey: 'mercado' } });
        expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'id-1' }, data: { active: false } });
    });
});
