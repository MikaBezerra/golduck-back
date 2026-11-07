import type { AppError } from '../../common/errors/app-error';
import { jest } from '@jest/globals';

import { Prisma } from '../../../generated/prisma/client';
import { CategoryRepository } from '../repository/category.repository';
import { CategoryService } from '../service/category.service';
import { InMemoryCategoryRepository } from './in-memory-category.repository';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' });

/** Regras do cadastro de categorias, com o repositório em memória no lugar do banco. */
describe('CategoryService', () => {
    let repository: InMemoryCategoryRepository;
    let service: CategoryService;

    beforeEach(() => {
        repository = new InMemoryCategoryRepository();
        service = new CategoryService(repository as unknown as CategoryRepository);
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    describe('create', () => {
        it('tira espaços sobrando do nome e devolve só os campos públicos', async () => {
            const created = await service.create({ name: '  Casa   e   Moradia ' });

            expect(created).toMatchObject({ name: 'Casa e Moradia', active: true, isDefault: false });
            expect(Object.keys(created).sort()).toEqual(['active', 'createdAt', 'id', 'isDefault', 'name', 'updatedAt']);
            expect(repository.categories.get(created.id)?.nameKey).toBe('casa e moradia');
        });

        it('recusa nome repetido sem diferenciar maiúsculas, antes de tentar gravar', async () => {
            repository.seed({ name: 'Mercado' });
            const create = jest.spyOn(repository, 'create');

            await expectAppError(service.create({ name: 'MERCADO' }), {
                code: 'CATEGORY_NAME_CONFLICT', statusCode: 409, reason: 'category_name_already_exists'
            });
            expect(create).not.toHaveBeenCalled();
        });

        it('traduz a violação de unicidade do banco (corrida entre duas criações) para 409', async () => {
            jest.spyOn(repository, 'create').mockRejectedValue(uniqueViolation());

            await expectAppError(service.create({ name: 'Lazer' }), {
                code: 'CATEGORY_NAME_CONFLICT', statusCode: 409, reason: 'category_name_already_exists'
            });
        });

        it('deixa passar outros erros sem mascarar: de conexão, outro código do Prisma ou um P2002 que não é do Prisma', async () => {
            const failures = [
                new Error('conexão caiu'),
                new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'teste' }),
                Object.assign(new Error('parecido'), { code: 'P2002' })
            ];

            for (const failure of failures) {
                jest.spyOn(repository, 'create').mockRejectedValueOnce(failure);

                await expect(service.create({ name: 'Lazer' })).rejects.toBe(failure);
            }
        });
    });

    describe('findAll', () => {
        it('lista só as ativas por padrão, em ordem alfabética', async () => {
            repository.seed({ name: 'Transporte' });
            repository.seed({ name: 'Antiga', active: false });
            repository.seed({ name: 'Mercado' });

            const names = (await service.findAll()).map(category => category.name);

            expect(names).toEqual(['Mercado', 'Transporte']);
        });

        it('com includeInactive, traz também as inativas (depois das ativas)', async () => {
            repository.seed({ name: 'Antiga', active: false });
            repository.seed({ name: 'Mercado' });

            const names = (await service.findAll(true)).map(category => category.name);

            expect(names).toEqual(['Mercado', 'Antiga']);
        });
    });

    describe('findById e findDefault', () => {
        it('devolve a categoria pelo id', async () => {
            const category = repository.seed({ name: 'Saúde' });

            await expect(service.findById(category.id)).resolves.toMatchObject({ id: category.id, name: 'Saúde' });
        });

        it('id inexistente: 404 CATEGORY_NOT_FOUND', async () => {
            await expectAppError(service.findById(MISSING_ID), {
                code: 'CATEGORY_NOT_FOUND', statusCode: 404, reason: 'category_id_not_found'
            });
        });

        it('encontra a categoria padrão', async () => {
            const outros = repository.seed({ name: 'Outros', isDefault: true });

            await expect(service.findDefault()).resolves.toBe(outros);
        });

        it('sem categoria padrão é erro de instalação (falta a migração), não erro do usuário', async () => {
            await expect(service.findDefault()).rejects.toThrow('Categoria padrão não encontrada');
        });
    });

    describe('update', () => {
        it('renomeia normalizando o nome', async () => {
            const category = repository.seed({ name: 'Mercado' });

            const updated = await service.update(category.id, { name: ' Super   mercado ' });

            expect(updated.name).toBe('Super mercado');
            expect(repository.categories.get(category.id)?.nameKey).toBe('super mercado');
        });

        it('aceita trocar só a caixa do próprio nome (a chave não muda)', async () => {
            const category = repository.seed({ name: 'mercado' });

            await expect(service.update(category.id, { name: 'Mercado' })).resolves.toMatchObject({ name: 'Mercado' });
        });

        it('desativa e reativa sem mexer no nome', async () => {
            const category = repository.seed({ name: 'Lazer' });

            await expect(service.update(category.id, { active: false })).resolves.toMatchObject({ name: 'Lazer', active: false });
            await expect(service.update(category.id, { active: true })).resolves.toMatchObject({ name: 'Lazer', active: true });
        });

        it('recusa o nome de outra categoria antes de tentar gravar (409)', async () => {
            repository.seed({ name: 'Mercado' });
            const category = repository.seed({ name: 'Feira' });
            const update = jest.spyOn(repository, 'update');

            await expectAppError(service.update(category.id, { name: 'mercado' }), {
                code: 'CATEGORY_NAME_CONFLICT', statusCode: 409, reason: 'category_name_already_exists'
            });
            expect(update).not.toHaveBeenCalled();
            expect(repository.categories.get(category.id)?.name).toBe('Feira');
        });

        it('a categoria padrão não pode ser alterada (409 CATEGORY_DEFAULT_PROTECTED)', async () => {
            const outros = repository.seed({ name: 'Outros', isDefault: true });

            await expectAppError(service.update(outros.id, { active: false }), {
                code: 'CATEGORY_DEFAULT_PROTECTED', statusCode: 409, reason: 'default_category_update'
            });
            expect(repository.categories.get(outros.id)?.active).toBe(true);
        });

        it('id inexistente: 404', async () => {
            await expectAppError(service.update(MISSING_ID, { active: false }), {
                code: 'CATEGORY_NOT_FOUND', statusCode: 404, reason: 'category_id_not_found'
            });
        });

        it('corrida no banco (P2002) vira 409; outros erros passam como vieram', async () => {
            const category = repository.seed({ name: 'Feira' });
            const failure = new Error('conexão caiu');
            jest.spyOn(repository, 'update').mockRejectedValueOnce(uniqueViolation()).mockRejectedValueOnce(failure);

            await expectAppError(service.update(category.id, { name: 'Hortifruti' }), {
                code: 'CATEGORY_NAME_CONFLICT', statusCode: 409, reason: 'category_name_already_exists'
            });
            await expect(service.update(category.id, { name: 'Hortifruti' })).rejects.toBe(failure);
        });
    });
});
