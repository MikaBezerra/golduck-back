import type { TestResponse } from '../../../testing/http-test-app.js';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { CreditCardsModule } from '../credit-cards.module.js';
import { CreditCardRepository } from '../repository/credit-card.repository.js';
import { InMemoryCreditCardRepository } from './in-memory-credit-card.repository.js';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
/** UUID válido, mas da versão 1 (a rota só aceita v4). */
const UUID_V1 = 'a8098c1a-f86e-11da-bd1a-00112444be1e';

/*
 * Rotas /credit-cards por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no credit-card.service.spec.
 */
describe('rotas /credit-cards', () => {
    let repository: InMemoryCreditCardRepository;
    let api: HttpTestApp;

    beforeEach(async () => {
        repository = new InMemoryCreditCardRepository();
        api = await HttpTestApp.create({
            imports: [CreditCardsModule],
            overrides: [{ provide: CreditCardRepository, useValue: repository }]
        });
    });

    afterEach(async () => {
        await api.close();
    });

    /** Confere 400 VALIDATION_ERROR e o único detalhe recusado. */
    const expectInvalid = (response: TestResponse, detail: { field?: string; code?: string; message?: string }): void => {
        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        expect(errorOf(response).details).toEqual([expect.objectContaining(detail)]);
    };

    it('exige login (401 AUTH_UNAUTHENTICATED sem token ou com token inválido)', async () => {
        const withoutToken = await api.get('/credit-cards', { auth: false });
        const invalidToken = await api.post('/credit-cards', { name: 'Nubank', bank: 'NUBANK' }, { auth: 'nao-e-um-jwt' });

        expect(withoutToken.status).toBe(401);
        expect(errorOf(withoutToken).code).toBe('AUTH_UNAUTHENTICATED');
        expect(invalidToken.status).toBe(401);
        expect(repository.cards.size).toBe(0);
    });

    describe('POST /credit-cards', () => {
        it('cria (201) com o nome normalizado e devolve o cartão no envelope { data }', async () => {
            const response = await api.post('/credit-cards', { name: '  Nubank   Mikaell ', bank: 'NUBANK' });

            expect(response.status).toBe(201);
            expect(dataOf(response)).toMatchObject({ name: 'Nubank Mikaell', bank: 'NUBANK', active: true });
            expect(repository.cards.size).toBe(1);
        });

        it('nome: obrigatório, texto, não vazio e até 120 caracteres', async () => {
            expect((await api.post('/credit-cards', { name: 'x'.repeat(120), bank: 'C6' })).status).toBe(201);
            expect((await api.post('/credit-cards', { name: 'x', bank: 'C6' })).status).toBe(201);

            expectInvalid(await api.post('/credit-cards', { bank: 'C6' }), { field: 'name', code: 'any.required', message: 'name é obrigatório' });
            expectInvalid(await api.post('/credit-cards', { name: '   ', bank: 'C6' }), { field: 'name', code: 'string.empty' });
            expectInvalid(await api.post('/credit-cards', { name: 7, bank: 'C6' }), { field: 'name', code: 'string.base' });
            expectInvalid(await api.post('/credit-cards', { name: 'x'.repeat(121), bank: 'C6' }), {
                field: 'name', code: 'string.max', message: 'name deve ter no máximo 120 caracteres'
            });
            expect(repository.cards.size).toBe(2);
        });

        it('banco: obrigatório e só NUBANK, C6 ou NEON (exatamente assim)', async () => {
            for (const bank of ['NUBANK', 'C6', 'NEON']) {
                const response = await api.post('/credit-cards', { name: `Cartão ${bank}`, bank });

                expect(response.status).toBe(201);
                expect(dataOf(response)).toMatchObject({ bank });
            }

            expectInvalid(await api.post('/credit-cards', { name: 'Cartão' }), { field: 'bank', code: 'any.required' });

            for (const bank of ['ITAU', 'nubank', 'C 6']) {
                expectInvalid(await api.post('/credit-cards', { name: 'Cartão', bank }), {
                    field: 'bank', code: 'any.only', message: 'bank deve conter um dos valores permitidos'
                });
            }

            for (const bank of ['', 3]) {
                const response = await api.post('/credit-cards', { name: 'Cartão', bank });

                expect(response.status).toBe(400);
                expect(errorOf(response).details).toContainEqual(expect.objectContaining({ field: 'bank', code: 'any.only' }));
            }
            expect(repository.cards.size).toBe(3);
        });

        it('recusa campos extras (400)', async () => {
            expectInvalid(await api.post('/credit-cards', { name: 'Nubank', bank: 'NUBANK', active: false }), {
                field: 'active', code: 'object.unknown'
            });
            expect(repository.cards.size).toBe(0);
        });
    });

    describe('GET /credit-cards', () => {
        it('lista só os ativos, por nome', async () => {
            repository.seed({ name: 'Neon', bank: 'NEON' });
            repository.seed({ name: 'Antigo', active: false });
            repository.seed({ name: 'C6 Ayanne', bank: 'C6' });

            const response = await api.get('/credit-cards');

            expect(response.status).toBe(200);
            expect(dataOf<Array<{ name: string; bank: string }>>(response).map(card => [card.name, card.bank])).toEqual([
                ['C6 Ayanne', 'C6'],
                ['Neon', 'NEON']
            ]);
        });
    });

    describe('GET /credit-cards/:id', () => {
        it('devolve o cartão, mesmo inativo', async () => {
            const card = repository.seed({ name: 'Antigo', bank: 'C6', active: false });

            const response = await api.get(`/credit-cards/${card.id}`);

            expect(response.status).toBe(200);
            expect(dataOf(response)).toMatchObject({ id: card.id, name: 'Antigo', bank: 'C6', active: false });
        });

        it('id que não é UUID v4 dá 400; id inexistente dá 404 CREDIT_CARD_NOT_FOUND', async () => {
            expectInvalid(await api.get('/credit-cards/123'), { field: '$', code: 'string.guid', message: 'id deve conter um UUID válido' });
            expectInvalid(await api.get(`/credit-cards/${UUID_V1}`), { field: '$', code: 'string.guid' });

            const missing = await api.get(`/credit-cards/${MISSING_ID}`);

            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'CREDIT_CARD_NOT_FOUND', message: 'Cartão não encontrado' });
        });
    });

    describe('PATCH /credit-cards/:id', () => {
        it('renomeia (normalizando) e desativa; o banco continua o mesmo', async () => {
            const card = repository.seed({ name: 'Nubank', bank: 'NUBANK' });

            const renamed = await api.patch(`/credit-cards/${card.id}`, { name: '  Nubank   Ayanne ' });
            const deactivated = await api.patch(`/credit-cards/${card.id}`, { active: false });
            const both = await api.patch(`/credit-cards/${card.id}`, { name: 'Nubank Mikaell', active: true });

            expect(renamed.status).toBe(200);
            expect(dataOf(renamed)).toMatchObject({ name: 'Nubank Ayanne', bank: 'NUBANK', active: true });
            expect(dataOf(deactivated)).toMatchObject({ name: 'Nubank Ayanne', active: false });
            expect(dataOf(both)).toMatchObject({ name: 'Nubank Mikaell', bank: 'NUBANK', active: true });
        });

        it('valida o corpo: vazio, troca de banco, nome em branco ou longo e active não booleano (400)', async () => {
            const card = repository.seed({ name: 'Nubank', bank: 'NUBANK' });

            const empty = await api.patch(`/credit-cards/${card.id}`, {});

            expect(empty.status).toBe(400);
            expect(errorOf(empty).details).toEqual([expect.objectContaining({ field: '$', code: 'object.min' })]);
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { bank: 'C6' }), { field: 'bank', code: 'object.unknown' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { name: ' ' }), { field: 'name', code: 'string.empty' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { name: 'x'.repeat(121) }), { field: 'name', code: 'string.max' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { active: 'sim' }), { field: 'active', code: 'boolean.base' });
            expect(repository.cards.get(card.id)).toMatchObject({ name: 'Nubank', bank: 'NUBANK', active: true });
        });

        it('id inválido dá 400 e inexistente dá 404', async () => {
            expectInvalid(await api.patch('/credit-cards/abc', { active: false }), { field: '$', code: 'string.guid' });

            const missing = await api.patch(`/credit-cards/${MISSING_ID}`, { active: false });

            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'CREDIT_CARD_NOT_FOUND', message: 'Cartão não encontrado' });
        });
    });

    describe('ciclo da fatura e Meu Pluggy', () => {
        const ITEM_ID = '0b7c5a52-3d4e-4f6a-8b9c-0d1e2f3a4b5c';

        it('POST e PATCH aceitam vencimento, melhor dia, item e primeira fatura; PATCH aceita null para desligar', async () => {
            const created = await api.post('/credit-cards', {
                name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: '2026-11'
            });
            const id = dataOf<{ id: string }>(created).id;
            const off = await api.patch(`/credit-cards/${id}`, { pluggyItemId: null, syncFromMonth: null, bestPurchaseDay: 27 });

            expect(created.status).toBe(201);
            expect(dataOf(created)).toMatchObject({ dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: '2026-11', sync: { configured: true } });
            expect(dataOf(off)).toMatchObject({ pluggyItemId: null, syncFromMonth: null, bestPurchaseDay: 27, sync: { configured: false } });
        });

        it('valida dias (1 a 31, inteiros), item (UUID) e mês (AAAA-MM)', async () => {
            const card = repository.seed({ name: 'C6', bank: 'C6' });

            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { dueDay: 0 }), { field: 'dueDay', code: 'number.min' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { bestPurchaseDay: 32 }), { field: 'bestPurchaseDay', code: 'number.max' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { dueDay: 1.5 }), { field: 'dueDay', code: 'number.integer' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { pluggyItemId: 'abc' }), { field: 'pluggyItemId', code: 'string.guid' });
            expectInvalid(await api.patch(`/credit-cards/${card.id}`, { syncFromMonth: '2026-13' }), {
                field: 'syncFromMonth', message: 'O mês deve estar no formato AAAA-MM'
            });
            expectInvalid(await api.post('/credit-cards', { name: 'X', bank: 'C6', pluggyItemId: null }), { field: 'pluggyItemId', code: 'string.base' });
        });

        it('GET /:id/bills lista as faturas do período; sem ciclo configurado é 409', async () => {
            const card = repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25 });
            const other = repository.seed({ name: 'Sem ciclo' });

            const bills = await api.get(`/credit-cards/${card.id}/bills`, { query: { from: '2026-12', to: '2027-01' } });
            const notConfigured = await api.get(`/credit-cards/${other.id}/bills`);

            expect(bills.status).toBe(200);
            expect(dataOf(bills)).toEqual([
                expect.objectContaining({ month: '2026-12', startDate: '2026-10-25', closingDate: '2026-11-24', dueDate: '2026-12-01', source: 'default' }),
                expect.objectContaining({ month: '2027-01', startDate: '2026-11-25' })
            ]);
            expect(notConfigured.status).toBe(409);
            expect(errorOf(notConfigured).code).toBe('CREDIT_CARD_BILLING_NOT_CONFIGURED');
            expectInvalid(await api.get(`/credit-cards/${card.id}/bills`, { query: { from: '12/2026' } }), { field: 'from' });
            expectInvalid(await api.get(`/credit-cards/${card.id}/bills`, { query: { mes: '2026-12' } }), { field: 'mes', code: 'object.unknown' });
        });

        it('PUT /:id/bills/:month ajusta o melhor dia; valida mês da rota e data', async () => {
            const card = repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25 });

            const adjusted = await api.request('PUT', `/credit-cards/${card.id}/bills/2026-12`, { body: { bestPurchaseDate: '2026-11-24' } });
            const outOfRange = await api.request('PUT', `/credit-cards/${card.id}/bills/2026-12`, { body: { bestPurchaseDate: '2027-01-05' } });

            expect(adjusted.status).toBe(200);
            expect(dataOf(adjusted)).toMatchObject({ month: '2026-12', bestPurchaseDate: '2026-11-24', source: 'user' });
            expect(outOfRange.status).toBe(422);
            expect(errorOf(outOfRange).code).toBe('CREDIT_CARD_BILL_DATE_OUT_OF_RANGE');
            expectInvalid(await api.request('PUT', `/credit-cards/${card.id}/bills/dezembro`, { body: { bestPurchaseDate: null } }), { field: '$' });
            expectInvalid(await api.request('PUT', `/credit-cards/${card.id}/bills/2026-12`, { body: { bestPurchaseDate: '2026-02-30' } }), {
                field: 'bestPurchaseDate', code: 'any.invalid'
            });
            expectInvalid(await api.request('PUT', `/credit-cards/${card.id}/bills/2026-12`, { body: {} }), {
                field: 'bestPurchaseDate', code: 'any.required'
            });
        });

        it('PUT e DELETE /:id/bills/:month/payment marcam e desmarcam a fatura como paga', async () => {
            const card = repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25 });
            repository.billTotals.push({ cardId: card.id, month: new Date('2020-01-01T00:00:00.000Z'), totalCents: 5_000n });

            const paid = await api.request('PUT', `/credit-cards/${card.id}/bills/2020-01/payment`);
            const unpaid = await api.request('DELETE', `/credit-cards/${card.id}/bills/2020-01/payment`);
            const open = await api.request('PUT', `/credit-cards/${card.id}/bills/2099-01/payment`);

            expect(paid.status).toBe(200);
            expect(dataOf(paid)).toMatchObject({ cardId: card.id, month: '2020-01', status: 'paid', total: '50.00', paidAmount: '50.00' });
            expect(unpaid.status).toBe(200);
            expect(dataOf(unpaid)).toMatchObject({ status: 'overdue', paidAt: null, paidAmount: null });
            expect(open.status).toBe(409);
            expect(errorOf(open).code).toBe('CREDIT_CARD_BILL_NOT_CLOSED');
            expectInvalid(await api.request('PUT', `/credit-cards/${card.id}/bills/2020-13/payment`), { field: '$' });
            expectInvalid(await api.request('DELETE', `/credit-cards/${UUID_V1}/bills/2020-01/payment`), { field: '$' });
            expect((await api.request('PUT', `/credit-cards/${MISSING_ID}/bills/2020-01/payment`)).status).toBe(404);
        });
    });

    describe('limite e resumo das faturas', () => {
        it('POST e PATCH aceitam o limite em reais (PATCH aceita null); formato inválido é 400', async () => {
            const created = await api.post('/credit-cards', { name: 'C6', bank: 'C6', creditLimit: '8000.00' });
            const id = dataOf<{ id: string }>(created).id;

            expect(created.status).toBe(201);
            expect(dataOf(created)).toMatchObject({ creditLimit: '8000.00' });
            expect(dataOf(await api.patch(`/credit-cards/${id}`, { creditLimit: null }))).toMatchObject({ creditLimit: null });
            expectInvalid(await api.patch(`/credit-cards/${id}`, { creditLimit: '10,50' }), { field: 'creditLimit', code: 'string.pattern.base' });
            expectInvalid(await api.post('/credit-cards', { name: 'X', bank: 'C6', creditLimit: 100 }), { field: 'creditLimit', code: 'string.base' });
            expect(errorOf(await api.patch(`/credit-cards/${id}`, { creditLimit: '0' })).code).toBe('CREDIT_CARD_INVALID_AMOUNT');
        });

        it('GET /credit-cards/bills/summary?month devolve o resumo; mês obrigatório e no formato AAAA-MM', async () => {
            const card = repository.seed({ name: 'Nubank', creditLimitCents: 100_000n });
            repository.billTotals.push({ cardId: card.id, month: new Date('2020-01-01T00:00:00.000Z'), totalCents: 1_000n });

            const summary = await api.get('/credit-cards/bills/summary', { query: { month: '2020-01' } });

            expect(summary.status).toBe(200);
            expect(dataOf(summary)).toEqual({
                month: '2020-01',
                total: '10.00',
                cards: [expect.objectContaining({ cardId: card.id, cardName: 'Nubank', total: '10.00', status: 'closed', creditLimit: '1000.00' })]
            });
            expectInvalid(await api.get('/credit-cards/bills/summary'), { field: 'month', code: 'any.required' });
            expectInvalid(await api.get('/credit-cards/bills/summary', { query: { month: '01/2020' } }), { field: 'month' });
            expectInvalid(await api.get('/credit-cards/bills/summary', { query: { month: '2020-01', cardId: card.id } }), {
                field: 'cardId', code: 'object.unknown'
            });
        });
    });

    it('todo erro traz o requestId, igual ao header x-request-id', async () => {
        const response = await api.get(`/credit-cards/${MISSING_ID}`, { headers: { 'x-request-id': 'teste-cartoes-1' } });

        expect(response.headers['x-request-id']).toBe('teste-cartoes-1');
        expect(errorOf(response).requestId).toBe('teste-cartoes-1');
    });
});
