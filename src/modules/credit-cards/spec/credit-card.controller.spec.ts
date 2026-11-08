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

    it('todo erro traz o requestId, igual ao header x-request-id', async () => {
        const response = await api.get(`/credit-cards/${MISSING_ID}`, { headers: { 'x-request-id': 'teste-cartoes-1' } });

        expect(response.headers['x-request-id']).toBe('teste-cartoes-1');
        expect(errorOf(response).requestId).toBe('teste-cartoes-1');
    });
});
