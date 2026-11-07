import type { Category, Person } from '../../../generated/prisma/client';
import type { CategoryRepository } from '../../categories/repository/category.repository';
import type { AppError } from '../../common/errors/app-error';
import type { PersonRepository } from '../../people/repository/person.repository';
import type { ManualExpenseRepository } from '../repository/manual-expense.repository';
import { jest } from '@jest/globals';

import { Prisma } from '../../../generated/prisma/client';
import { CategoryService } from '../../categories/service/category.service';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository';
import { PersonService } from '../../people/service/person.service';
import { ManualExpenseService } from '../service/manual-expense.service';
import { FakePersonRepository } from './fake-person.repository';
import { InMemoryManualExpenseRepository } from './in-memory-manual-expense.repository';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const SEPTEMBER = new Date('2026-09-01T00:00:00.000Z');
const OCTOBER = new Date('2026-10-01T00:00:00.000Z');
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const DECEMBER = new Date('2026-12-01T00:00:00.000Z');

const recordNotFound = (): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'teste' });

/**
 * Regras das despesas fora do cartão (compartilhadas ou de uma pessoa), com repositórios em memória
 * no lugar do banco. Categorias e pessoas passam pelos serviços de verdade.
 */
describe('ManualExpenseService', () => {
    let categories: InMemoryCategoryRepository;
    let people: FakePersonRepository;
    let repository: InMemoryManualExpenseRepository;
    let service: ManualExpenseService;
    let outros: Category;
    let mercado: Category;
    let ana: Person;

    beforeEach(() => {
        categories = new InMemoryCategoryRepository();
        people = new FakePersonRepository();
        repository = new InMemoryManualExpenseRepository();
        service = new ManualExpenseService(
            repository as unknown as ManualExpenseRepository,
            new CategoryService(categories as unknown as CategoryRepository),
            new PersonService(people as unknown as PersonRepository)
        );
        outros = categories.seed({ name: 'Outros', isDefault: true });
        mercado = categories.seed({ name: 'Mercado' });
        ana = people.seed({ name: 'Ana' });
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    describe('create', () => {
        it('sem categoria nem pessoa: uma despesa compartilhada na categoria padrão, com o valor em centavos', async () => {
            const created = await service.create({ month: '2026-10', title: 'Internet', amount: '99.9' });

            expect(created).toHaveLength(1);
            const row = repository.get(created[0].id);
            expect(row).toMatchObject({ month: OCTOBER, title: 'Internet', amountCents: 9990n, categoryId: outros.id, personId: null });
            expect(created[0]).toEqual({
                id: row.id,
                month: '2026-10',
                title: 'Internet',
                amount: '99.90',
                categoryId: outros.id,
                personId: null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
            });
        });

        it('usa a categoria e a pessoa escolhidas (despesa individual)', async () => {
            const [created] = await service.create({
                month: '2026-03', title: 'Feira', amount: '1234.56', categoryId: mercado.id, personId: ana.id
            });

            expect(created).toMatchObject({ month: '2026-03', amount: '1234.56', categoryId: mercado.id, personId: ana.id });
            expect(repository.get(created.id)).toMatchObject({ month: new Date('2026-03-01T00:00:00.000Z'), amountCents: 123456n });
        });

        it('personId null também é compartilhada, sem consultar o cadastro de pessoas', async () => {
            const findPerson = jest.spyOn(people, 'findById');

            const [created] = await service.create({ month: '2026-10', title: 'Luz', amount: '150', personId: null });

            expect(created.personId).toBeNull();
            expect(created.amount).toBe('150.00');
            expect(findPerson).not.toHaveBeenCalled();
        });

        it('com replicateUntilYearEnd, cria uma despesa independente em cada mês até dezembro', async () => {
            const created = await service.create({
                month: '2026-10', title: 'Academia', amount: '120.00', categoryId: mercado.id, personId: ana.id, replicateUntilYearEnd: true
            });

            expect(created.map(expense => expense.month)).toEqual(['2026-10', '2026-11', '2026-12']);
            expect(new Set(created.map(expense => expense.id)).size).toBe(3);
            expect([...repository.expenses.values()].map(expense => expense.month)).toEqual([OCTOBER, NOVEMBER, DECEMBER]);

            for (const expense of created) {
                expect(expense).toMatchObject({ title: 'Academia', amount: '120.00', categoryId: mercado.id, personId: ana.id });
            }
        });

        it('replicar a partir de janeiro cria o ano todo; a partir de dezembro, só dezembro', async () => {
            const fromJanuary = await service.create({ month: '2027-01', title: 'Seguro', amount: '50', replicateUntilYearEnd: true });
            const fromDecember = await service.create({ month: '2027-12', title: 'Seguro', amount: '50', replicateUntilYearEnd: true });

            expect(fromJanuary.map(expense => expense.month)).toEqual([
                '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
                '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12'
            ]);
            expect(fromDecember.map(expense => expense.month)).toEqual(['2027-12']);
        });

        it('sem replicar (ou com replicateUntilYearEnd false) cria só o mês pedido', async () => {
            const withFalse = await service.create({ month: '2026-02', title: 'Presente', amount: '80', replicateUntilYearEnd: false });

            expect(withFalse.map(expense => expense.month)).toEqual(['2026-02']);
            expect(repository.expenses.size).toBe(1);
        });

        it('devolve em ordem de mês mesmo que o banco devolva fora de ordem', async () => {
            jest.spyOn(repository, 'createMany').mockImplementation(async entries =>
                Promise.resolve(entries.map(entry => repository.seed(entry)).reverse()));

            const created = await service.create({ month: '2026-09', title: 'Curso', amount: '300', replicateUntilYearEnd: true });

            expect(created.map(expense => expense.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
        });

        it('recusa valor zero ou que não cabe em centavos (400), sem gravar nada', async () => {
            const createMany = jest.spyOn(repository, 'createMany');

            for (const amount of ['0', '0.00', '92233720368547758.08']) {
                await expectAppError(service.create({ month: '2026-10', title: 'Nada', amount }), {
                    code: 'MANUAL_EXPENSE_INVALID_AMOUNT', statusCode: 400, reason: 'manual_expense_amount_invalid'
                });
            }

            expect(createMany).not.toHaveBeenCalled();
        });

        it('aceita o maior valor que cabe em centavos', async () => {
            const [created] = await service.create({ month: '2026-10', title: 'Teto', amount: '92233720368547758.07' });

            expect(created.amount).toBe('92233720368547758.07');
        });

        it('recusa categoria inativa (409) sem gravar', async () => {
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const createMany = jest.spyOn(repository, 'createMany');

            await expectAppError(service.create({ month: '2026-10', title: 'Velha', amount: '10', categoryId: antiga.id }), {
                code: 'MANUAL_EXPENSE_INACTIVE_CATEGORY', statusCode: 409, reason: 'category_inactive'
            });
            expect(createMany).not.toHaveBeenCalled();
        });

        it('categoria inexistente: 404 CATEGORY_NOT_FOUND (vem do cadastro de categorias)', async () => {
            await expectAppError(service.create({ month: '2026-10', title: 'X', amount: '10', categoryId: MISSING_ID }), {
                code: 'CATEGORY_NOT_FOUND', statusCode: 404, reason: 'category_id_not_found'
            });
            expect(repository.expenses.size).toBe(0);
        });

        it('recusa pessoa inativa (409) sem gravar', async () => {
            const bia = people.seed({ name: 'Bia', active: false });

            await expectAppError(service.create({ month: '2026-10', title: 'X', amount: '10', personId: bia.id }), {
                code: 'MANUAL_EXPENSE_INACTIVE_PERSON', statusCode: 409, reason: 'person_inactive'
            });
            expect(repository.expenses.size).toBe(0);
        });

        it('pessoa inexistente: 404 PERSON_NOT_FOUND (vem do cadastro de pessoas)', async () => {
            await expectAppError(service.create({ month: '2026-10', title: 'X', amount: '10', personId: MISSING_ID }), {
                code: 'PERSON_NOT_FOUND', statusCode: 404, reason: 'person_id_not_found'
            });
        });

        it('sem a categoria padrão no banco é erro de instalação, não do usuário', async () => {
            categories.categories.delete(outros.id);

            await expect(service.create({ month: '2026-10', title: 'X', amount: '10' })).rejects.toThrow('Categoria padrão não encontrada');
        });
    });

    describe('findAll', () => {
        it('lista só as despesas do mês pedido, por título', async () => {
            repository.seed({ month: OCTOBER, title: 'Luz', categoryId: outros.id, amountCents: 15075n });
            repository.seed({ month: SEPTEMBER, title: 'Aluguel', categoryId: outros.id });
            repository.seed({ month: OCTOBER, title: 'Condomínio', categoryId: outros.id, personId: ana.id });
            repository.seed({ month: NOVEMBER, title: 'Internet', categoryId: outros.id });

            const expenses = await service.findAll({ month: '2026-10' });

            expect(expenses.map(expense => expense.title)).toEqual(['Condomínio', 'Luz']);
            expect(expenses[0]).toMatchObject({ month: '2026-10', personId: ana.id, amount: '10.00' });
            expect(expenses[1]).toMatchObject({ month: '2026-10', personId: null, amount: '150.75' });
        });

        it('converte janeiro e dezembro sem escorregar de ano', async () => {
            repository.seed({ month: new Date('2027-01-01T00:00:00.000Z'), title: 'Janeiro', categoryId: outros.id });
            repository.seed({ month: DECEMBER, title: 'Dezembro', categoryId: outros.id });

            const january = await service.findAll({ month: '2027-01' });
            const december = await service.findAll({ month: '2026-12' });

            expect(january.map(expense => expense.title)).toEqual(['Janeiro']);
            expect(december.map(expense => expense.title)).toEqual(['Dezembro']);
        });

        it('mês sem despesas devolve lista vazia', async () => {
            await expect(service.findAll({ month: '2026-10' })).resolves.toEqual([]);
        });
    });

    describe('findById', () => {
        it('devolve a despesa no formato da API', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Gás', categoryId: mercado.id, personId: ana.id, amountCents: 5n });

            await expect(service.findById(expense.id)).resolves.toEqual({
                id: expense.id,
                month: '2026-10',
                title: 'Gás',
                amount: '0.05',
                categoryId: mercado.id,
                personId: ana.id,
                createdAt: expense.createdAt,
                updatedAt: expense.updatedAt
            });
        });

        it('id inexistente: 404 MANUAL_EXPENSE_NOT_FOUND', async () => {
            await expectAppError(service.findById(MISSING_ID), {
                code: 'MANUAL_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'manual_expense_id_not_found'
            });
        });
    });

    describe('updateMany', () => {
        it('só o título: valor, categoria e pessoa ficam como estavam (sem consultar cadastros)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net', categoryId: mercado.id, personId: ana.id, amountCents: 9990n });
            const update = jest.spyOn(repository, 'updateManyByIds');
            const findCategory = jest.spyOn(categories, 'findById');
            const findDefault = jest.spyOn(categories, 'findDefault');
            const findPerson = jest.spyOn(people, 'findById');

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { title: 'Fibra' } });

            expect(updated).toMatchObject({ id: expense.id, title: 'Fibra', amount: '99.90', categoryId: mercado.id, personId: ana.id, month: '2026-10' });
            expect(update).toHaveBeenCalledWith([expense.id], { title: 'Fibra', amountCents: undefined, categoryId: undefined, personId: undefined });
            expect(findCategory).not.toHaveBeenCalled();
            expect(findDefault).not.toHaveBeenCalled();
            expect(findPerson).not.toHaveBeenCalled();
        });

        it('converte o novo valor para centavos', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net', categoryId: mercado.id });

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { amount: '1500' } });

            expect(updated.amount).toBe('1500.00');
            expect(repository.get(expense.id)).toMatchObject({ amountCents: 150000n, title: 'Net', categoryId: mercado.id });
        });

        it('troca a categoria e a pessoa; personId null torna a despesa compartilhada', async () => {
            const lazer = categories.seed({ name: 'Lazer' });
            const first = repository.seed({ month: OCTOBER, title: 'Cinema', categoryId: outros.id });
            const second = repository.seed({ month: OCTOBER, title: 'Show', categoryId: outros.id, personId: ana.id });

            const [moved] = await service.updateMany({ ids: [first.id], changes: { categoryId: lazer.id, personId: ana.id } });
            const [shared] = await service.updateMany({ ids: [second.id], changes: { personId: null } });

            expect(moved).toMatchObject({ categoryId: lazer.id, personId: ana.id });
            expect(shared).toMatchObject({ categoryId: outros.id, personId: null });
            expect(repository.get(second.id).personId).toBeNull();
        });

        it('altera todas as despesas pedidas de uma vez e devolve todas', async () => {
            const first = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const second = repository.seed({ month: NOVEMBER, title: 'B', categoryId: outros.id });
            const untouched = repository.seed({ month: NOVEMBER, title: 'C', categoryId: outros.id });

            const updated = await service.updateMany({ ids: [first.id, second.id], changes: { categoryId: mercado.id } });

            expect(updated.map(expense => [expense.id, expense.month, expense.categoryId])).toEqual([
                [first.id, '2026-10', mercado.id],
                [second.id, '2026-11', mercado.id]
            ]);
            expect(repository.get(untouched.id).categoryId).toBe(outros.id);
        });

        it('recusa valor inválido (400) sem alterar nada', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net', categoryId: outros.id });
            const update = jest.spyOn(repository, 'updateManyByIds');

            await expectAppError(service.updateMany({ ids: [expense.id], changes: { amount: '0.00' } }), {
                code: 'MANUAL_EXPENSE_INVALID_AMOUNT', statusCode: 400, reason: 'manual_expense_amount_invalid'
            });
            expect(update).not.toHaveBeenCalled();
        });

        it('recusa categoria ou pessoa inativa (409) sem alterar nada', async () => {
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const bia = people.seed({ name: 'Bia', active: false });
            const expense = repository.seed({ month: OCTOBER, title: 'Net', categoryId: outros.id });
            const update = jest.spyOn(repository, 'updateManyByIds');

            await expectAppError(service.updateMany({ ids: [expense.id], changes: { categoryId: antiga.id } }), {
                code: 'MANUAL_EXPENSE_INACTIVE_CATEGORY', statusCode: 409, reason: 'category_inactive'
            });
            await expectAppError(service.updateMany({ ids: [expense.id], changes: { personId: bia.id } }), {
                code: 'MANUAL_EXPENSE_INACTIVE_PERSON', statusCode: 409, reason: 'person_inactive'
            });
            expect(update).not.toHaveBeenCalled();
        });

        it('um id inexistente: 404 e nenhuma despesa muda (transação)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net', categoryId: outros.id });

            await expectAppError(service.updateMany({ ids: [expense.id, MISSING_ID], changes: { title: 'Outra' } }), {
                code: 'MANUAL_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'manual_expense_id_not_found'
            });
            expect(repository.get(expense.id).title).toBe('Net');
        });

        it('outros erros do banco passam como vieram (inclusive um P2025 que não é do Prisma)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net', categoryId: outros.id });
            const failures = [
                new Error('conexão caiu'),
                new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' }),
                Object.assign(new Error('parecido'), { code: 'P2025' })
            ];

            for (const failure of failures) {
                jest.spyOn(repository, 'updateManyByIds').mockRejectedValueOnce(failure);

                await expect(service.updateMany({ ids: [expense.id], changes: { title: 'Outra' } })).rejects.toBe(failure);
            }
        });
    });

    describe('deleteMany', () => {
        it('exclui as despesas pedidas e mantém as outras', async () => {
            const first = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const second = repository.seed({ month: OCTOBER, title: 'B', categoryId: outros.id });
            const kept = repository.seed({ month: OCTOBER, title: 'C', categoryId: outros.id });

            await expect(service.deleteMany([first.id, second.id])).resolves.toBeUndefined();

            expect([...repository.expenses.keys()]).toEqual([kept.id]);
        });

        it('um id inexistente: 404 e nada é excluído (transação)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });

            await expectAppError(service.deleteMany([expense.id, MISSING_ID]), {
                code: 'MANUAL_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'manual_expense_id_not_found'
            });
            expect(repository.expenses.has(expense.id)).toBe(true);
        });

        it('P2025 vira 404; outros erros passam como vieram', async () => {
            const failure = new Error('conexão caiu');
            jest.spyOn(repository, 'deleteManyByIds').mockRejectedValueOnce(recordNotFound()).mockRejectedValueOnce(failure);

            await expectAppError(service.deleteMany([MISSING_ID]), {
                code: 'MANUAL_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'manual_expense_id_not_found'
            });
            await expect(service.deleteMany([MISSING_ID])).rejects.toBe(failure);
        });
    });
});
