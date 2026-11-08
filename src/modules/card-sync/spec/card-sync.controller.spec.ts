import type { Category, CreditCard } from '../../../generated/prisma/client.js';
import type { CardSyncResultResponse } from '../dto/card-sync.dto.js';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { InMemoryCardExpenseRepository } from '../../card-expenses/spec/in-memory-card-expense.repository.js';
import { CategoryRepository } from '../../categories/repository/category.repository.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { CreditCardRepository } from '../../credit-cards/repository/credit-card.repository.js';
import { InMemoryCreditCardRepository } from '../../credit-cards/spec/in-memory-credit-card.repository.js';
import { CardSyncModule } from '../card-sync.module.js';
import { PluggyClient, PluggyRequestError } from '../pluggy/pluggy-client.js';
import { CardSyncRepository } from '../repository/card-sync.repository.js';
import { FakePluggyClient, InMemoryCardSyncRepository } from './in-memory-card-sync.js';
import { c6Description, pluggyTransaction } from './pluggy-fixtures.js';

const ITEM_ID = '0b7c5a52-3d4e-4f6a-8b9c-0d1e2f3a4b5c';
const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const CRON_SECRET = 'segredo-da-rotina-de-teste';

/*
 * Rotas da sincronização por HTTP: login (e a rotina sem login, com o CRON_SECRET), envelope e
 * códigos de status. As regras ficam no card-sync.service.spec.
 */
describe('rotas da sincronização', () => {
    let cards: InMemoryCreditCardRepository;
    let pluggy: FakePluggyClient;
    let api: HttpTestApp;
    let card: CreditCard;
    let outros: Category;

    beforeEach(async () => {
        process.env.CRON_SECRET = CRON_SECRET;
        cards = new InMemoryCreditCardRepository();
        pluggy = new FakePluggyClient();
        const categories = new InMemoryCategoryRepository();
        outros = categories.seed({ name: 'Outros', isDefault: true });
        card = cards.seed({
            name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: new Date('2026-11-01T00:00:00.000Z')
        });
        pluggy.transactions = [pluggyTransaction({ description: c6Description('PADARIA'), amount: 7.5, date: '2026-11-06T12:00:00.000Z' })];
        api = await HttpTestApp.create({
            imports: [CardSyncModule],
            overrides: [
                { provide: CreditCardRepository, useValue: cards },
                { provide: CategoryRepository, useValue: categories },
                { provide: CardSyncRepository, useValue: new InMemoryCardSyncRepository(new InMemoryCardExpenseRepository()) },
                { provide: PluggyClient, useValue: pluggy }
            ]
        });
    });

    afterEach(async () => {
        await api.close();
        delete process.env.CRON_SECRET;
    });

    it('exige login nas rotas do botão (401)', async () => {
        const one = await api.post(`/credit-cards/${card.id}/sync`, undefined, { auth: false });
        const all = await api.post('/card-sync', undefined, { auth: false });

        expect(one.status).toBe(401);
        expect(all.status).toBe(401);
        expect(pluggy.calls).toEqual([]);
    });

    it('POST /credit-cards/:id/sync sincroniza o cartão (200); id inválido é 400 e inexistente é 404', async () => {
        const response = await api.post(`/credit-cards/${card.id}/sync`);
        const invalid = await api.post('/credit-cards/abc/sync');
        const missing = await api.post(`/credit-cards/${MISSING_ID}/sync`);

        expect(response.status).toBe(200);
        expect(dataOf<CardSyncResultResponse>(response)).toMatchObject({ cardId: card.id, summary: { created: 1 }, error: null, sync: { status: 'UPDATED' } });
        expect(invalid.status).toBe(400);
        expect(missing.status).toBe(404);
    });

    it('erro da Pluggy chega com status e código', async () => {
        pluggy.failure = new PluggyRequestError(503, 'HTTP_503', 'fora do ar');

        const response = await api.post(`/credit-cards/${card.id}/sync`);

        expect(response.status).toBe(502);
        expect(errorOf(response).code).toBe('PLUGGY_UNAVAILABLE');
    });

    it('sem categoria padrão: o botão do cartão responde 500 CATEGORY_DEFAULT_MISSING e o de todos traz o erro no cartão', async () => {
        outros.isDefault = false;

        const one = await api.post(`/credit-cards/${card.id}/sync`);
        const all = await api.post('/card-sync');

        expect(one.status).toBe(500);
        expect(errorOf(one).code).toBe('CATEGORY_DEFAULT_MISSING');
        expect(all.status).toBe(200);
        expect(dataOf<CardSyncResultResponse[]>(all).map(result => result.error?.code)).toEqual(['CATEGORY_DEFAULT_MISSING']);
    });

    it('POST /card-sync sincroniza todos e responde 200 com o resultado de cada cartão', async () => {
        const response = await api.post('/card-sync');

        expect(response.status).toBe(200);
        expect(dataOf<CardSyncResultResponse[]>(response).map(result => [result.cardName, result.error])).toEqual([['C6', null]]);
    });

    it('GET /card-sync/cron: sem login, mas só com "Authorization: Bearer <CRON_SECRET>"', async () => {
        const ok = await api.get('/card-sync/cron', { auth: false, headers: { authorization: `Bearer ${CRON_SECRET}` } });
        const wrong = await api.get('/card-sync/cron', { auth: false, headers: { authorization: 'Bearer outro' } });
        const missing = await api.get('/card-sync/cron', { auth: false });

        expect(ok.status).toBe(200);
        expect(dataOf<CardSyncResultResponse[]>(ok)).toHaveLength(1);
        expect(wrong.status).toBe(401);
        expect(errorOf(wrong).code).toBe('CRON_UNAUTHORIZED');
        expect(missing.status).toBe(401);
    });
});
