import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { PersonRepository } from '../repository/person.repository.js';

/*
 * O repositório só monta consultas do Prisma; o teste confere o filtro e a ordenação pedidos
 * (é aí que mora a regra "só ativas, em ordem alfabética").
 */
describe('PersonRepository', () => {
    const prisma = {
        person: {
            create: jest.fn(async () => Promise.resolve({})),
            findMany: jest.fn(async () => Promise.resolve([])),
            findUnique: jest.fn(async () => Promise.resolve(null)),
            update: jest.fn(async () => Promise.resolve({}))
        }
    };
    const repository = new PersonRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('findAll sem inativas: só ativas, por nome', async () => {
        await repository.findAll(false);

        expect(prisma.person.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: [{ name: 'asc' }] });
    });

    it('findAll com inativas: todas, ativas primeiro e depois por nome', async () => {
        await repository.findAll(true);

        expect(prisma.person.findMany).toHaveBeenCalledWith({
            where: undefined,
            orderBy: [{ active: 'desc' }, { name: 'asc' }]
        });
    });

    it('devolve o que o Prisma devolveu', async () => {
        const person = { id: 'id-1', name: 'Ayanne' };
        prisma.person.findUnique.mockResolvedValueOnce(person as never);

        await expect(repository.findById('id-1')).resolves.toBe(person);
        expect(prisma.person.findUnique).toHaveBeenCalledWith({ where: { id: 'id-1' } });
    });

    it('cria só com nome, e-mail e celular (campos extras não chegam ao banco)', async () => {
        const data = { name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999', active: false };

        await repository.create(data);

        expect(prisma.person.create).toHaveBeenCalledWith({
            data: { name: 'Ayanne', email: 'ayanne@exemplo.com', phone: '+5511999999999' }
        });
    });

    it('altera pelo id só com os campos conhecidos (undefined não muda nada no Prisma)', async () => {
        const data = { name: 'Ayanne Souza', email: null, active: false, extra: 'ignorado' };

        await repository.update('id-1', data);

        expect(prisma.person.update).toHaveBeenCalledWith({
            where: { id: 'id-1' },
            data: { name: 'Ayanne Souza', email: null, phone: undefined, active: false }
        });
    });
});
