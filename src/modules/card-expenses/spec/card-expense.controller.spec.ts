import type { Category, Person } from '../../../generated/prisma/client.js';
import type { TestResponse } from '../../../testing/http-test-app.js';
import type { CardExpensesModule } from '../card-expenses.module.js';
import { jest } from '@jest/globals';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { CategoryRepository } from '../../categories/repository/category.repository.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { CreditCardRepository } from '../../credit-cards/repository/credit-card.repository.js';
import { InMemoryCreditCardRepository } from '../../credit-cards/spec/in-memory-credit-card.repository.js';
import { FakePersonRepository } from '../../manual-expenses/spec/fake-person.repository.js';
import { PersonRepository } from '../../people/repository/person.repository.js';
import { CardExpenseRepository } from '../repository/card-expense.repository.js';
import * as cardExpenseScope from '../service/card-expense-scope.js';
import { CARD_ID, InMemoryCardExpenseRepository } from './in-memory-card-expense.repository.js';

/*
 * Contorno: dto/card-expense.dto.ts importa o tipo CardExpenseScope sem `import type`. No Jest
 * (isolatedModules), o metadado do @ApiProperty vira uma referência em tempo de execução a esse
 * import, e o ESM falha ("does not provide an export named 'CardExpenseScope'"). Até o código de
 * produção mudar, o teste acrescenta esse export (vazio) ao módulo de escopo, sem mudar o resto,
 * e só então carrega o módulo testado.
 */
jest.unstable_mockModule('../service/card-expense-scope.js', () => ({ ...cardExpenseScope, CardExpenseScope: undefined }));

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const OTHER_CARD_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
/** UUID válido, mas versão 1: os ids da API são v4. */
const UUID_V1 = '3f2a9c1e-8b7d-1c2a-9e1f-5a6b7c8d9e0f';
const SEPTEMBER = new Date('2026-09-01T00:00:00.000Z');
const OCTOBER = new Date('2026-10-01T00:00:00.000Z');
const EXCLUDED_AT = new Date('2026-10-05T10:00:00.000Z');

type CardExpenseBody = {
    id: string;
    month: string;
    description: string;
    nickname: string | null;
    categoryId: string;
    split: string;
    personId: string | null;
    excluded: boolean;
    installment: { number: number; total: number } | null;
};

/** Campos apontados pela validação (details[].field). */
const fieldsOf = (response: TestResponse): string[] =>
    (errorOf(response).details as Array<{ field: string }>).map(detail => detail.field);

/** Mensagens da validação (details[].message). */
const messagesOf = (response: TestResponse): string[] =>
    (errorOf(response).details as Array<{ message: string }>).map(detail => detail.message);

/*
 * Rotas /card-expenses por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no card-expense.service.spec.
 */
describe('rotas /card-expenses', () => {
    let categories: InMemoryCategoryRepository;
    let people: FakePersonRepository;
    let repository: InMemoryCardExpenseRepository;
    let cards: InMemoryCreditCardRepository;
    let api: HttpTestApp;
    let outros: Category;
    let mercado: Category;
    let ana: Person;
    let cardExpensesModule: typeof CardExpensesModule;

    beforeAll(async () => {
        cardExpensesModule = (await import('../card-expenses.module.js')).CardExpensesModule;
    });

    beforeEach(async () => {
        categories = new InMemoryCategoryRepository();
        people = new FakePersonRepository();
        repository = new InMemoryCardExpenseRepository();
        cards = new InMemoryCreditCardRepository();
        cards.seed({ id: CARD_ID, name: 'C6', bank: 'C6', syncFromMonth: OCTOBER });
        outros = categories.seed({ name: 'Outros', isDefault: true });
        mercado = categories.seed({ name: 'Mercado' });
        ana = people.seed({ name: 'Ana' });
        api = await HttpTestApp.create({
            imports: [cardExpensesModule],
            overrides: [
                { provide: CardExpenseRepository, useValue: repository },
                { provide: CategoryRepository, useValue: categories },
                { provide: PersonRepository, useValue: people },
                { provide: CreditCardRepository, useValue: cards }
            ]
        });
    });

    afterEach(async () => {
        await api.close();
    });

    const expectValidationError = (response: TestResponse, fields: string[]): void => {
        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        expect(fieldsOf(response)).toEqual(fields);
    };

    it('exige login em todas as rotas (401 AUTH_UNAUTHENTICATED)', async () => {
        const body = { ids: [MISSING_ID], scope: 'month' };
        const responses = [
            await api.get('/card-expenses', { auth: false, query: { month: '2026-10' } }),
            await api.get(`/card-expenses/${MISSING_ID}`, { auth: false }),
            await api.patch('/card-expenses', { ids: [MISSING_ID], changes: { nickname: 'X' } }, { auth: false }),
            await api.delete('/card-expenses', { auth: 'nao-e-um-jwt', body }),
            await api.post('/card-expenses/restore', body, { auth: false })
        ];

        for (const response of responses) {
            expect(response.status).toBe(401);
            expect(errorOf(response).code).toBe('AUTH_UNAUTHENTICATED');
        }
    });

    describe('GET /card-expenses', () => {
        it('lista as do mês sem as excluídas; includeExcluded=true traz todas; cardId filtra o cartão', async () => {
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'ATIVA' });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'EXCLUIDA', excludedAt: EXCLUDED_AT });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'OUTRO CARTAO', cardId: OTHER_CARD_ID });
            repository.seed({ month: SEPTEMBER, categoryId: outros.id, originalDescription: 'SETEMBRO' });

            const visible = await api.get('/card-expenses', { query: { month: '2026-10' } });
            const explicitFalse = await api.get('/card-expenses', { query: { month: '2026-10', includeExcluded: false } });
            const all = await api.get('/card-expenses', { query: { month: '2026-10', includeExcluded: true, cardId: CARD_ID } });
            const otherCard = await api.get('/card-expenses', { query: { month: '2026-10', cardId: OTHER_CARD_ID } });

            const listed = (response: TestResponse): Array<[string, boolean]> =>
                dataOf<CardExpenseBody[]>(response).map(expense => [expense.description, expense.excluded]);
            expect(visible.status).toBe(200);
            expect(listed(visible)).toEqual([['ATIVA', false], ['OUTRO CARTAO', false]]);
            expect(listed(explicitFalse)).toEqual(listed(visible));
            expect(listed(all)).toEqual([['ATIVA', false], ['EXCLUIDA', true]]);
            expect(listed(otherCard)).toEqual([['OUTRO CARTAO', false]]);
        });

        it('split=PENDING lista só as compras que faltam classificar', async () => {
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'PENDENTE', split: 'PENDING' });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'COMPARTILHADA' });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'DA ANA', personId: ana.id });

            const pending = await api.get('/card-expenses', { query: { month: '2026-10', split: 'PENDING' } });
            const personal = await api.get('/card-expenses', { query: { month: '2026-10', split: 'PERSONAL' } });

            expect(dataOf<CardExpenseBody[]>(pending).map(expense => [expense.description, expense.split])).toEqual([['PENDENTE', 'PENDING']]);
            expect(dataOf<CardExpenseBody[]>(personal).map(expense => expense.description)).toEqual(['DA ANA']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '2026-10', split: 'NINGUEM' } }), ['split']);
        });

        it('valida a consulta: mês AAAA-MM obrigatório, cardId UUID, includeExcluded booleano e sem filtros extras', async () => {
            const missing = await api.get('/card-expenses');
            const invalidMonth = await api.get('/card-expenses', { query: { month: '2026-13' } });

            expectValidationError(missing, ['month']);
            expectValidationError(invalidMonth, ['month']);
            expect(messagesOf(invalidMonth)).toEqual(['O mês deve estar no formato AAAA-MM']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '12026-10' } }), ['month']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '2026-100' } }), ['month']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '2026-10', cardId: '123' } }), ['cardId']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '2026-10', cardId: UUID_V1 } }), ['cardId']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '2026-10', includeExcluded: 'talvez' } }), ['includeExcluded']);
            expectValidationError(await api.get('/card-expenses', { query: { month: '2026-10', personId: ana.id } }), ['personId']);
        });

        it('aceita meses de 01 a 12', async () => {
            for (const month of ['2026-01', '2026-09', '2026-10', '2026-12']) {
                const response = await api.get('/card-expenses', { query: { month } });

                expect(response.status).toBe(200);
            }
        });
    });

    describe('GET /card-expenses/:id', () => {
        it('devolve a despesa; id que não é UUID dá 400 e id inexistente dá 404', async () => {
            const expense = repository.seed({
                month: OCTOBER, categoryId: mercado.id, originalDescription: 'LOJA', nickname: 'Sofá', installmentNumber: 2, installmentTotal: 10
            });

            const found = await api.get(`/card-expenses/${expense.id}`);
            const notUuid = await api.get('/card-expenses/123');
            const missing = await api.get(`/card-expenses/${MISSING_ID}`);

            expect(found.status).toBe(200);
            expect(dataOf(found)).toMatchObject({
                id: expense.id, month: '2026-10', description: 'Sofá', originalDescription: 'LOJA', installment: { number: 2, total: 10 }, excluded: false
            });
            expect(notUuid.status).toBe(400);
            expect(errorOf(notUuid).details).toEqual([expect.objectContaining({ field: '$', code: 'string.guid', message: 'id deve conter um UUID válido' })]);
            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'CARD_EXPENSE_NOT_FOUND', message: 'Despesa do cartão não encontrada' });
        });
    });

    describe('PATCH /card-expenses', () => {
        it('altera apelido, categoria e pessoa de várias despesas (e das parcelas seguintes) e devolve todas', async () => {
            const single = repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'A' });
            const [first, second, third] = repository.seedInstallments(SEPTEMBER, 3, { categoryId: outros.id, purchaseKey: 'P|2026-09|3|B' });

            const response = await api.patch('/card-expenses', {
                ids: [single.id, second.id],
                changes: { nickname: '  Presente ', categoryId: mercado.id, split: 'PERSONAL', personId: ana.id }
            });

            expect(response.status).toBe(200);
            const updated = dataOf<CardExpenseBody[]>(response);
            expect(updated.map(expense => expense.id).sort()).toEqual([single.id, second.id, third.id].sort());
            expect(updated.every(expense =>
                expense.nickname === 'Presente' && expense.categoryId === mercado.id && expense.personId === ana.id)).toBe(true);
            expect(repository.get(first.id)).toMatchObject({ nickname: null, categoryId: outros.id });
        });

        it('nickname null remove o apelido e split SHARED torna compartilhada', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'NETFLIX', nickname: 'Filmes', personId: ana.id });

            const response = await api.patch('/card-expenses', { ids: [expense.id], changes: { nickname: null, split: 'SHARED' } });

            expect(response.status).toBe(200);
            expect(dataOf<CardExpenseBody[]>(response)[0]).toMatchObject({ nickname: null, description: 'NETFLIX', split: 'SHARED', personId: null });
        });

        it('apelido: não vazio e até 160 caracteres (já sem os espaços das pontas)', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const ids = [expense.id];

            const longest = await api.patch('/card-expenses', { ids, changes: { nickname: ` ${'x'.repeat(160)} ` } });

            expect(longest.status).toBe(200);
            expect(dataOf<CardExpenseBody[]>(longest)[0].nickname).toBe('x'.repeat(160));
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { nickname: 'x'.repeat(161) } }), ['changes.nickname']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { nickname: '   ' } }), ['changes.nickname']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { nickname: 10 } }), ['changes.nickname']);
        });

        it('valida ids e changes: obrigatórios, UUID v4, sem repetição, pelo menos um campo e sem campos extras', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const ids = [expense.id];
            const changes = { nickname: 'X' };

            expectValidationError(await api.patch('/card-expenses', { changes }), ['ids']);
            // Lista vazia: falta o item obrigatório e fica abaixo do mínimo (dois avisos).
            expectValidationError(await api.patch('/card-expenses', { ids: [], changes }), ['ids', 'ids']);
            expectValidationError(await api.patch('/card-expenses', { ids: [expense.id, expense.id], changes }), ['ids[1]']);
            expectValidationError(await api.patch('/card-expenses', { ids: ['123'], changes }), ['ids[0]', 'ids']);
            expectValidationError(await api.patch('/card-expenses', { ids }), ['changes']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: {} }), ['changes']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { amount: '10.00' } }), ['changes.amount']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes, scope: 'all' }), ['scope']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { categoryId: null } }), ['changes.categoryId']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { categoryId: UUID_V1 } }), ['changes.categoryId']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { split: 'PERSONAL', personId: 'ana' } }), ['changes.personId']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { split: 'PERSONAL' } }), ['changes.personId']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { personId: ana.id } }), ['changes.personId']);
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { split: 'SHARED', personId: ana.id } }), ['changes.personId']);
            // Voltar para pendente não é uma escolha.
            expectValidationError(await api.patch('/card-expenses', { ids, changes: { split: 'PENDING' } }), ['changes.split']);
            expect(repository.get(expense.id).nickname).toBeNull();
        });

        it('categoria ou pessoa inativa: 409; inexistente: 404; id de despesa inexistente: 404', async () => {
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const bia = people.seed({ name: 'Bia', active: false });
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const ids = [expense.id];

            const inactiveCategory = await api.patch('/card-expenses', { ids, changes: { categoryId: antiga.id } });
            const inactivePerson = await api.patch('/card-expenses', { ids, changes: { split: 'PERSONAL', personId: bia.id } });
            const missingCategory = await api.patch('/card-expenses', { ids, changes: { categoryId: MISSING_ID } });
            const missingPerson = await api.patch('/card-expenses', { ids, changes: { split: 'PERSONAL', personId: MISSING_ID } });
            const missingExpense = await api.patch('/card-expenses', { ids: [expense.id, MISSING_ID], changes: { nickname: 'X' } });

            expect(inactiveCategory.status).toBe(409);
            expect(errorOf(inactiveCategory)).toMatchObject({ code: 'CARD_EXPENSE_INACTIVE_CATEGORY', message: 'A categoria selecionada está inativa' });
            expect(inactivePerson.status).toBe(409);
            expect(errorOf(inactivePerson)).toMatchObject({ code: 'CARD_EXPENSE_INACTIVE_PERSON', message: 'A pessoa selecionada está inativa' });
            expect(missingCategory.status).toBe(404);
            expect(errorOf(missingCategory).code).toBe('CATEGORY_NOT_FOUND');
            expect(missingPerson.status).toBe(404);
            expect(errorOf(missingPerson).code).toBe('PERSON_NOT_FOUND');
            expect(missingExpense.status).toBe(404);
            expect(errorOf(missingExpense)).toMatchObject({ code: 'CARD_EXPENSE_NOT_FOUND', message: 'Despesa do cartão não encontrada' });
            expect(repository.get(expense.id)).toMatchObject({ categoryId: outros.id, personId: null, nickname: null });
        });
    });

    describe('DELETE /card-expenses e POST /card-expenses/restore', () => {
        it('exclui (204, sem corpo) e restaura (200, com as linhas restauradas), em cada escopo', async () => {
            for (const scope of ['month', 'forward', 'backward', 'all']) {
                const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });

                const excluded = await api.delete('/card-expenses', { body: { ids: [expense.id], scope } });

                expect(excluded.status).toBe(204);
                expect(excluded.body).toBeUndefined();
                expect(repository.get(expense.id).excludedAt).not.toBeNull();

                const restored = await api.post('/card-expenses/restore', { ids: [expense.id], scope });

                expect(restored.status).toBe(200);
                expect(dataOf<CardExpenseBody[]>(restored)).toEqual([expect.objectContaining({ id: expense.id, excluded: false })]);
                expect(repository.get(expense.id).excludedAt).toBeNull();
            }
        });

        it('em compra parcelada, o escopo define as parcelas afetadas', async () => {
            const [first, second, third] = repository.seedInstallments(SEPTEMBER, 3, { categoryId: outros.id, purchaseKey: 'P|2026-09|3|TV' });

            await api.delete('/card-expenses', { body: { ids: [second.id], scope: 'forward' } });
            const restored = await api.post('/card-expenses/restore', { ids: [third.id], scope: 'backward' });

            expect(repository.get(first.id).excludedAt).toBeNull();
            expect(dataOf<CardExpenseBody[]>(restored).map(expense => expense.installment)).toEqual([{ number: 2, total: 3 }, { number: 3, total: 3 }]);
        });

        it('restaurar o que não está excluído devolve lista vazia', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });

            const response = await api.post('/card-expenses/restore', { ids: [expense.id], scope: 'month' });

            expect(response.status).toBe(200);
            expect(dataOf(response)).toEqual([]);
        });

        it('valida o corpo: ids e scope obrigatórios, scope conhecido e sem campos extras', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const ids = [expense.id];

            for (const send of [
                async (body: unknown): Promise<TestResponse> => api.delete('/card-expenses', { body }),
                async (body: unknown): Promise<TestResponse> => api.post('/card-expenses/restore', body)
            ]) {
                expectValidationError(await send({ ids }), ['scope']);
                expectValidationError(await send({ scope: 'month' }), ['ids']);
                expectValidationError(await send({ ids: [], scope: 'month' }), ['ids', 'ids']);
                expectValidationError(await send({ ids: [expense.id, expense.id], scope: 'month' }), ['ids[1]']);
                expectValidationError(await send({ ids: ['123'], scope: 'month' }), ['ids[0]', 'ids']);
                expectValidationError(await send({ ids, scope: 'month', remember: true }), ['remember']);

                const unknownScope = await send({ ids, scope: 'year' });
                expectValidationError(unknownScope, ['scope']);
                expect(errorOf(unknownScope).details).toEqual([expect.objectContaining({ code: 'any.only' })]);
            }

            expect(repository.get(expense.id).excludedAt).toBeNull();
        });

        it('um id inexistente: 404 e nada muda', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, excludedAt: EXCLUDED_AT });

            const excluded = await api.delete('/card-expenses', { body: { ids: [expense.id, MISSING_ID], scope: 'all' } });
            const restored = await api.post('/card-expenses/restore', { ids: [expense.id, MISSING_ID], scope: 'all' });

            for (const response of [excluded, restored]) {
                expect(response.status).toBe(404);
                expect(errorOf(response).code).toBe('CARD_EXPENSE_NOT_FOUND');
            }

            expect(repository.get(expense.id).excludedAt).toEqual(EXCLUDED_AT);
        });
    });

    describe('POST /card-expenses ("Adicionar compra") e POST /card-expenses/:id/move', () => {
        it('adiciona a compra (201) e valida o corpo (400)', async () => {
            const created = await api.post('/card-expenses', {
                cardId: CARD_ID, month: '2026-12', date: '2026-11-06', description: 'Padaria', amount: '12.50',
                installment: { number: 1, total: 2 }, split: 'SHARED'
            });
            const withoutSplit = await api.post('/card-expenses', {
                cardId: CARD_ID, month: '2026-12', date: '2026-11-06', description: 'Padaria', amount: '12.50'
            });
            const personalWithoutPerson = await api.post('/card-expenses', {
                cardId: CARD_ID, month: '2026-12', date: '2026-11-06', description: 'Padaria', amount: '12.50', split: 'PERSONAL'
            });
            const invalid = await api.post('/card-expenses', {
                cardId: 'x', month: '2026-13', date: '2026-02-30', description: '', amount: '12,50', installment: { number: 3, total: 2 }, extra: 1
            });

            expect(created.status).toBe(201);
            expect(dataOf<CardExpenseBody[]>(created).map(row => [row.month, row.installment])).toEqual([
                ['2026-12', { number: 1, total: 2 }],
                ['2027-01', { number: 2, total: 2 }]
            ]);
            expect(dataOf<CardExpenseBody[]>(created)[0]).toMatchObject({ split: 'SHARED', personId: null });
            expectValidationError(invalid, ['cardId', 'month', 'date', 'description', 'amount', 'installment.number', 'split', 'extra']);
            // "Adicionar compra" exige escolher a pessoa (ou compartilhada) na hora.
            expectValidationError(withoutSplit, ['split']);
            expectValidationError(personalWithoutPerson, ['personId']);
        });

        it('move a compra (200) e devolve as linhas; valida o corpo e recusa compra de upload (409)', async () => {
            const synced = repository.seed({ month: OCTOBER, categoryId: outros.id, origin: 'SYNC', importId: null, purchaseKey: 'S|2026-09-30|500|X' });
            const uploaded = repository.seed({ month: OCTOBER, categoryId: outros.id });

            const moved = await api.post(`/card-expenses/${synced.id}/move`, { month: '2026-11' });
            const fromUpload = await api.post(`/card-expenses/${uploaded.id}/move`, { month: '2026-11' });

            expect(moved.status).toBe(200);
            expect(dataOf<CardExpenseBody[]>(moved)).toEqual([expect.objectContaining({ month: '2026-11' })]);
            expect(fromUpload.status).toBe(409);
            expect(errorOf(fromUpload).code).toBe('CARD_EXPENSE_MOVE_NOT_ALLOWED');
            expectValidationError(await api.post(`/card-expenses/${synced.id}/move`, { installmentNumber: 0 }), ['month', 'installmentNumber']);
            expectValidationError(await api.post(`/card-expenses/${UUID_V1}/move`, { month: '2026-11' }), ['$']);
        });
    });
});
