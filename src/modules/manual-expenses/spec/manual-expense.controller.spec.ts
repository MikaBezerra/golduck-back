import type { Category, Person } from '../../../generated/prisma/client.js';
import type { TestResponse } from '../../../testing/http-test-app.js';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { CategoryRepository } from '../../categories/repository/category.repository.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { PersonRepository } from '../../people/repository/person.repository.js';
import { ManualExpensesModule } from '../manual-expenses.module.js';
import { ManualExpenseRepository } from '../repository/manual-expense.repository.js';
import { FakePersonRepository } from './fake-person.repository.js';
import { InMemoryManualExpenseRepository } from './in-memory-manual-expense.repository.js';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
/** UUID válido, mas versão 1: os ids da API são v4. */
const UUID_V1 = '3f2a9c1e-8b7d-1c2a-9e1f-5a6b7c8d9e0f';
const OCTOBER = new Date('2026-10-01T00:00:00.000Z');

type ExpenseBody = { id: string; month: string; title: string; amount: string; categoryId: string; split: string; personId: string | null; paidAt: string | null };

/** Campos apontados pela validação (details[].field). */
const fieldsOf = (response: TestResponse): string[] =>
    (errorOf(response).details as Array<{ field: string }>).map(detail => detail.field);

/** Mensagens da validação (details[].message). */
const messagesOf = (response: TestResponse): string[] =>
    (errorOf(response).details as Array<{ message: string }>).map(detail => detail.message);

/*
 * Rotas /manual-expenses por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no manual-expense.service.spec.
 */
describe('rotas /manual-expenses', () => {
    let categories: InMemoryCategoryRepository;
    let people: FakePersonRepository;
    let repository: InMemoryManualExpenseRepository;
    let api: HttpTestApp;
    let outros: Category;
    let mercado: Category;
    let ana: Person;

    beforeEach(async () => {
        categories = new InMemoryCategoryRepository();
        people = new FakePersonRepository();
        repository = new InMemoryManualExpenseRepository();
        outros = categories.seed({ name: 'Outros', isDefault: true });
        mercado = categories.seed({ name: 'Mercado' });
        ana = people.seed({ name: 'Ana' });
        api = await HttpTestApp.create({
            imports: [ManualExpensesModule],
            overrides: [
                { provide: ManualExpenseRepository, useValue: repository },
                { provide: CategoryRepository, useValue: categories },
                { provide: PersonRepository, useValue: people }
            ]
        });
    });

    afterEach(async () => {
        await api.close();
    });

    /** Uma despesa válida, com o que o teste quiser trocar. */
    const newExpense = (changes: Record<string, unknown> = {}): Record<string, unknown> =>
        ({ month: '2026-10', title: 'Internet', amount: '99.90', split: 'SHARED', ...changes });

    const expectValidationError = (response: TestResponse, fields: string[]): void => {
        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        expect(fieldsOf(response)).toEqual(fields);
    };

    it('exige login em todas as rotas (401 AUTH_UNAUTHENTICATED)', async () => {
        const responses = [
            await api.get('/manual-expenses', { auth: false, query: { month: '2026-10' } }),
            await api.get(`/manual-expenses/${MISSING_ID}`, { auth: false }),
            await api.post('/manual-expenses', newExpense(), { auth: false }),
            await api.patch('/manual-expenses', { ids: [MISSING_ID], changes: { title: 'X' } }, { auth: 'nao-e-um-jwt' }),
            await api.delete('/manual-expenses', { auth: false, body: { ids: [MISSING_ID] } })
        ];

        for (const response of responses) {
            expect(response.status).toBe(401);
            expect(errorOf(response).code).toBe('AUTH_UNAUTHENTICATED');
        }

        expect(repository.expenses.size).toBe(0);
    });

    describe('POST /manual-expenses', () => {
        it('cria (201) e devolve a lista criada no envelope { data }', async () => {
            const response = await api.post('/manual-expenses', newExpense({ title: '  Internet  ', amount: '99.9' }));

            expect(response.status).toBe(201);
            const [created] = dataOf<ExpenseBody[]>(response);
            expect(dataOf<ExpenseBody[]>(response)).toHaveLength(1);
            expect(created).toMatchObject({ month: '2026-10', title: 'Internet', amount: '99.90', categoryId: outros.id, split: 'SHARED', personId: null });
            expect(repository.get(created.id)).toMatchObject({ month: OCTOBER, amountCents: 9990n });
        });

        it('com replicateUntilYearEnd, devolve uma despesa por mês até dezembro', async () => {
            const response = await api.post('/manual-expenses', newExpense({ replicateUntilYearEnd: true, split: 'PERSONAL', personId: ana.id, categoryId: mercado.id }));

            expect(response.status).toBe(201);
            expect(dataOf<ExpenseBody[]>(response).map(expense => [expense.month, expense.personId, expense.categoryId])).toEqual([
                ['2026-10', ana.id, mercado.id],
                ['2026-11', ana.id, mercado.id],
                ['2026-12', ana.id, mercado.id]
            ]);
        });

        it('aceita meses de 01 a 12 e anos de 1000 em diante', async () => {
            for (const month of ['2026-01', '2026-09', '2026-10', '2026-12', '1000-05']) {
                const response = await api.post('/manual-expenses', newExpense({ month }));

                expect(response.status).toBe(201);
                expect(dataOf<ExpenseBody[]>(response)[0].month).toBe(month);
            }
        });

        it('recusa mês fora do formato AAAA-MM (400, com a mensagem do formato)', async () => {
            for (const month of ['2026-13', '2026-00', '2026-1', '0999-01', '12026-01', '2026-011', '2026/01', 'outubro']) {
                const response = await api.post('/manual-expenses', newExpense({ month }));

                expectValidationError(response, ['month']);
                expect(messagesOf(response)).toEqual(['O mês deve estar no formato AAAA-MM']);
            }

            expectValidationError(await api.post('/manual-expenses', newExpense({ month: undefined })), ['month']);
            expect(repository.expenses.size).toBe(0);
        });

        it('título: obrigatório, não vazio e até 160 caracteres', async () => {
            const longest = await api.post('/manual-expenses', newExpense({ title: 'x'.repeat(160) }));

            expect(longest.status).toBe(201);
            expectValidationError(await api.post('/manual-expenses', newExpense({ title: 'x'.repeat(161) })), ['title']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ title: '   ' })), ['title']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ title: undefined })), ['title']);
            expect(repository.expenses.size).toBe(1);
        });

        it('aceita valores em reais com até 2 casas decimais', async () => {
            const cases: Array<[string, string]> = [['0.5', '0.50'], ['7', '7.00'], ['100', '100.00'], ['1234.56', '1234.56'], ['10.05', '10.05']];

            for (const [amount, expected] of cases) {
                const response = await api.post('/manual-expenses', newExpense({ amount }));

                expect(response.status).toBe(201);
                expect(dataOf<ExpenseBody[]>(response)[0].amount).toBe(expected);
            }
        });

        it('recusa valor fora do formato em reais (400, com a mensagem do formato)', async () => {
            for (const amount of ['10.555', '-1.00', '1,00', '01.00', '1.', '.50', 'R$ 10', 'x1.00', '1.000', '1.00x']) {
                const response = await api.post('/manual-expenses', newExpense({ amount }));

                expectValidationError(response, ['amount']);
                expect(messagesOf(response)).toEqual(['O valor deve estar em reais, por exemplo 100.00']);
            }

            expectValidationError(await api.post('/manual-expenses', newExpense({ amount: 100 })), ['amount']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ amount: undefined })), ['amount']);
            expect(repository.expenses.size).toBe(0);
        });

        it('valor com mais de 20 caracteres é erro de validação; zero ou grande demais é 400 MANUAL_EXPENSE_INVALID_AMOUNT', async () => {
            const tooLong = await api.post('/manual-expenses', newExpense({ amount: '1'.repeat(21) }));
            const tooBig = await api.post('/manual-expenses', newExpense({ amount: '1'.repeat(20) }));
            const zero = await api.post('/manual-expenses', newExpense({ amount: '0.00' }));

            expectValidationError(tooLong, ['amount']);

            for (const response of [tooBig, zero]) {
                expect(response.status).toBe(400);
                expect(errorOf(response)).toMatchObject({
                    code: 'MANUAL_EXPENSE_INVALID_AMOUNT',
                    message: 'O valor da despesa deve ser maior que zero e caber em centavos'
                });
            }

            expect(repository.expenses.size).toBe(0);
        });

        it('valida categoryId, split + personId (UUID v4; null só fora do PERSONAL), replicateUntilYearEnd e campos extras', async () => {
            const shared = await api.post('/manual-expenses', newExpense({ personId: null }));

            expect(shared.status).toBe(201);
            expect(dataOf<ExpenseBody[]>(shared)[0]).toMatchObject({ split: 'SHARED', personId: null });
            expectValidationError(await api.post('/manual-expenses', newExpense({ split: undefined })), ['split']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ split: 'PENDING' })), ['split']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ split: 'PERSONAL' })), ['personId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ split: 'PERSONAL', personId: null })), ['personId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ personId: ana.id })), ['personId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ categoryId: '123' })), ['categoryId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ categoryId: UUID_V1 })), ['categoryId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ categoryId: null })), ['categoryId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ split: 'PERSONAL', personId: 'ana' })), ['personId']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ replicateUntilYearEnd: 'talvez' })), ['replicateUntilYearEnd']);
            expectValidationError(await api.post('/manual-expenses', newExpense({ color: 'azul' })), ['color']);
            expectValidationError(await api.post('/manual-expenses', {}), ['month', 'title', 'amount', 'split']);
            expect(repository.expenses.size).toBe(1);
        });

        it('categoria ou pessoa inativa: 409; categoria ou pessoa inexistente: 404', async () => {
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const bia = people.seed({ name: 'Bia', active: false });

            const inactiveCategory = await api.post('/manual-expenses', newExpense({ categoryId: antiga.id }));
            const inactivePerson = await api.post('/manual-expenses', newExpense({ split: 'PERSONAL', personId: bia.id }));
            const missingCategory = await api.post('/manual-expenses', newExpense({ categoryId: MISSING_ID }));
            const missingPerson = await api.post('/manual-expenses', newExpense({ split: 'PERSONAL', personId: MISSING_ID }));

            expect(inactiveCategory.status).toBe(409);
            expect(errorOf(inactiveCategory)).toMatchObject({ code: 'MANUAL_EXPENSE_INACTIVE_CATEGORY', message: 'A categoria selecionada está inativa' });
            expect(inactivePerson.status).toBe(409);
            expect(errorOf(inactivePerson)).toMatchObject({ code: 'MANUAL_EXPENSE_INACTIVE_PERSON', message: 'A pessoa selecionada está inativa' });
            expect(missingCategory.status).toBe(404);
            expect(errorOf(missingCategory).code).toBe('CATEGORY_NOT_FOUND');
            expect(missingPerson.status).toBe(404);
            expect(errorOf(missingPerson).code).toBe('PERSON_NOT_FOUND');
            expect(repository.expenses.size).toBe(0);
        });
    });

    describe('GET /manual-expenses', () => {
        it('lista as despesas do mês, por título', async () => {
            repository.seed({ month: OCTOBER, title: 'Luz', categoryId: outros.id, amountCents: 15075n });
            repository.seed({ month: OCTOBER, title: 'Aluguel', categoryId: mercado.id, personId: ana.id });
            repository.seed({ month: new Date('2026-11-01T00:00:00.000Z'), title: 'Internet', categoryId: outros.id });

            const response = await api.get('/manual-expenses', { query: { month: '2026-10' } });

            expect(response.status).toBe(200);
            expect(dataOf<ExpenseBody[]>(response).map(expense => [expense.title, expense.amount, expense.personId])).toEqual([
                ['Aluguel', '10.00', ana.id],
                ['Luz', '150.75', null]
            ]);
        });

        it('exige o mês no formato AAAA-MM e recusa filtros desconhecidos (400)', async () => {
            const missing = await api.get('/manual-expenses');
            const invalid = await api.get('/manual-expenses', { query: { month: '2026-13' } });
            const unknownFilter = await api.get('/manual-expenses', { query: { month: '2026-10', personId: ana.id } });

            expectValidationError(missing, ['month']);
            expectValidationError(invalid, ['month']);
            expect(messagesOf(invalid)).toEqual(['O mês deve estar no formato AAAA-MM']);
            expectValidationError(unknownFilter, ['personId']);
        });
    });

    describe('GET /manual-expenses/:id', () => {
        it('devolve a despesa; id que não é UUID dá 400 e id inexistente dá 404', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Gás', categoryId: mercado.id, amountCents: 4590n });

            const found = await api.get(`/manual-expenses/${expense.id}`);
            const notUuid = await api.get('/manual-expenses/123');
            const missing = await api.get(`/manual-expenses/${MISSING_ID}`);

            expect(found.status).toBe(200);
            expect(dataOf(found)).toMatchObject({ id: expense.id, month: '2026-10', title: 'Gás', amount: '45.90', categoryId: mercado.id, personId: null });
            expect(notUuid.status).toBe(400);
            expect(errorOf(notUuid).details).toEqual([expect.objectContaining({ field: '$', code: 'string.guid', message: 'id deve conter um UUID válido' })]);
            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'MANUAL_EXPENSE_NOT_FOUND', message: 'Despesa não encontrada' });
        });
    });

    describe('PATCH /manual-expenses', () => {
        it('altera várias despesas de uma vez (vários campos) e devolve todas', async () => {
            const first = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const second = repository.seed({ month: OCTOBER, title: 'B', categoryId: outros.id, personId: ana.id });

            const response = await api.patch('/manual-expenses', {
                ids: [first.id, second.id],
                changes: { title: '  Fibra ', amount: '120.5', categoryId: mercado.id, split: 'SHARED' }
            });

            expect(response.status).toBe(200);
            expect(dataOf<ExpenseBody[]>(response)).toEqual([
                expect.objectContaining({ id: first.id, title: 'Fibra', amount: '120.50', categoryId: mercado.id, split: 'SHARED', personId: null }),
                expect.objectContaining({ id: second.id, title: 'Fibra', amount: '120.50', categoryId: mercado.id, split: 'SHARED', personId: null })
            ]);
        });

        it('paid marca e desmarca como paga; precisa ser booleano', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Luz', categoryId: outros.id });

            const paid = await api.patch('/manual-expenses', { ids: [expense.id], changes: { paid: true } });

            expect(paid.status).toBe(200);
            expect(dataOf<ExpenseBody[]>(paid)[0].paidAt).toEqual(expect.any(String));
            expect(dataOf<ExpenseBody[]>(await api.patch('/manual-expenses', { ids: [expense.id], changes: { paid: false } }))[0].paidAt).toBeNull();
            expectValidationError(await api.patch('/manual-expenses', { ids: [expense.id], changes: { paid: 'sim' } }), ['changes.paid']);
        });

        it('valida ids: obrigatórios, pelo menos um, UUID v4 e sem repetição', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const changes = { title: 'B' };

            expectValidationError(await api.patch('/manual-expenses', { changes }), ['ids']);
            // Lista vazia: falta o item obrigatório e fica abaixo do mínimo (dois avisos).
            expectValidationError(await api.patch('/manual-expenses', { ids: [], changes }), ['ids', 'ids']);
            expectValidationError(await api.patch('/manual-expenses', { ids: [expense.id, expense.id], changes }), ['ids[1]']);
            expectValidationError(await api.patch('/manual-expenses', { ids: ['123'], changes }), ['ids[0]', 'ids']);
            expectValidationError(await api.patch('/manual-expenses', { ids: expense.id, changes }), ['ids']);
            expect(repository.get(expense.id).title).toBe('A');
        });

        it('valida changes: obrigatório, com pelo menos um campo conhecido e válido', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const ids = [expense.id];

            expectValidationError(await api.patch('/manual-expenses', { ids }), ['changes']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: {} }), ['changes']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { color: 'azul' } }), ['changes.color']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { title: 'B' }, force: true }), ['force']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { title: ' ' } }), ['changes.title']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { title: 'x'.repeat(161) } }), ['changes.title']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { amount: '1,00' } }), ['changes.amount']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { categoryId: null } }), ['changes.categoryId']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { split: 'PERSONAL', personId: 'ana' } }), ['changes.personId']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { split: 'PERSONAL' } }), ['changes.personId']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { personId: ana.id } }), ['changes.personId']);
            expectValidationError(await api.patch('/manual-expenses', { ids, changes: { split: 'PENDING' } }), ['changes.split']);
            expect(repository.get(expense.id).title).toBe('A');
        });

        it('valor zero: 400 MANUAL_EXPENSE_INVALID_AMOUNT; categoria inativa: 409', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const antiga = categories.seed({ name: 'Antiga', active: false });

            const zero = await api.patch('/manual-expenses', { ids: [expense.id], changes: { amount: '0' } });
            const inactive = await api.patch('/manual-expenses', { ids: [expense.id], changes: { categoryId: antiga.id } });

            expect(zero.status).toBe(400);
            expect(errorOf(zero).code).toBe('MANUAL_EXPENSE_INVALID_AMOUNT');
            expect(inactive.status).toBe(409);
            expect(errorOf(inactive).code).toBe('MANUAL_EXPENSE_INACTIVE_CATEGORY');
            expect(repository.get(expense.id)).toMatchObject({ amountCents: 1000n, categoryId: outros.id });
        });

        it('um id inexistente: 404 MANUAL_EXPENSE_NOT_FOUND e nada muda', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });

            const response = await api.patch('/manual-expenses', { ids: [expense.id, MISSING_ID], changes: { title: 'B' } });

            expect(response.status).toBe(404);
            expect(errorOf(response)).toMatchObject({ code: 'MANUAL_EXPENSE_NOT_FOUND', message: 'Despesa não encontrada' });
            expect(repository.get(expense.id).title).toBe('A');
        });
    });

    describe('DELETE /manual-expenses', () => {
        it('exclui as despesas pedidas (204, sem corpo)', async () => {
            const first = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });
            const second = repository.seed({ month: OCTOBER, title: 'B', categoryId: outros.id });
            const kept = repository.seed({ month: OCTOBER, title: 'C', categoryId: outros.id });

            const response = await api.delete('/manual-expenses', { body: { ids: [first.id, second.id] } });

            expect(response.status).toBe(204);
            expect(response.body).toBeUndefined();
            expect([...repository.expenses.keys()]).toEqual([kept.id]);
        });

        it('valida o corpo: ids obrigatórios, UUID, sem repetição e sem campos extras', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });

            expectValidationError(await api.delete('/manual-expenses', { body: {} }), ['ids']);
            expectValidationError(await api.delete('/manual-expenses', { body: { ids: [] } }), ['ids', 'ids']);
            expectValidationError(await api.delete('/manual-expenses', { body: { ids: ['123'] } }), ['ids[0]', 'ids']);
            expectValidationError(await api.delete('/manual-expenses', { body: { ids: [expense.id, expense.id] } }), ['ids[1]']);
            expectValidationError(await api.delete('/manual-expenses', { body: { ids: [expense.id], all: true } }), ['all']);
            expect(repository.expenses.has(expense.id)).toBe(true);
        });

        it('um id inexistente: 404 e nada é excluído', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A', categoryId: outros.id });

            const response = await api.delete('/manual-expenses', { body: { ids: [expense.id, MISSING_ID] } });

            expect(response.status).toBe(404);
            expect(errorOf(response).code).toBe('MANUAL_EXPENSE_NOT_FOUND');
            expect(repository.expenses.has(expense.id)).toBe(true);
        });
    });
});
