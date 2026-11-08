import type { Category, CreditCard } from '../../../generated/prisma/client.js';
import type { CategoryRepository } from '../../categories/repository/category.repository.js';
import type { AppError } from '../../common/errors/app-error.js';
import type { Config } from '../../common/index.js';
import type { CreditCardRepository } from '../../credit-cards/repository/credit-card.repository.js';
import type { CardSyncRepository } from '../repository/card-sync.repository.js';

import { InMemoryCardExpenseRepository } from '../../card-expenses/spec/in-memory-card-expense.repository.js';
import { CategoryService } from '../../categories/service/category.service.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { CreditCardService } from '../../credit-cards/service/credit-card.service.js';
import { InMemoryCreditCardRepository } from '../../credit-cards/spec/in-memory-credit-card.repository.js';
import { PluggyRequestError } from '../pluggy/pluggy-client.js';
import { CardSyncService } from '../service/card-sync.service.js';
import { FakePluggyClient, InMemoryCardSyncRepository } from './in-memory-card-sync.js';
import { c6Description, pluggyTransaction } from './pluggy-fixtures.js';

const ITEM_ID = '0b7c5a52-3d4e-4f6a-8b9c-0d1e2f3a4b5c';
const CRON_SECRET = 'segredo-da-rotina-diaria';
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const ym = (date: Date): string => date.toISOString().slice(0, 7);

/**
 * Sincronização de ponta a ponta com a Pluggy falsa e os repositórios em memória: um cartão C6
 * (melhor dia 25, vence dia 1) sincronizado a partir da fatura de novembro.
 */
describe('CardSyncService', () => {
    let cards: InMemoryCreditCardRepository;
    let expenses: InMemoryCardExpenseRepository;
    let categories: InMemoryCategoryRepository;
    let pluggy: FakePluggyClient;
    let service: CardSyncService;
    let outros: Category;
    let c6: CreditCard;

    const createService = (config: Partial<Config> = { CRON_SECRET }): CardSyncService => new CardSyncService(
        new InMemoryCardSyncRepository(expenses) as unknown as CardSyncRepository,
        new CreditCardService(cards as unknown as CreditCardRepository),
        new CategoryService(categories as unknown as CategoryRepository),
        pluggy,
        config as Config
    );

    beforeEach(() => {
        cards = new InMemoryCreditCardRepository();
        expenses = new InMemoryCardExpenseRepository();
        categories = new InMemoryCategoryRepository();
        pluggy = new FakePluggyClient();
        outros = categories.seed({ name: 'Outros', isDefault: true });
        c6 = cards.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: NOVEMBER });
        pluggy.transactions = [
            // Fatura de novembro (fecha 25/10): a parcela lançada em 01/10 e a compra de 22/10 às 22h31, lançada em 23/10.
            pluggyTransaction({
                description: c6Description('LOJA DE MOVEIS'),
                amount: 114,
                date: '2026-10-01T03:00:00.000Z',
                creditCardMetadata: {
                    installmentNumber: 3, totalInstallments: 5, purchaseDate: '2026-08-07T13:32:00.000Z', cardNumber: '1234', billPostDate: '2026-10-01'
                }
            }),
            pluggyTransaction({
                description: c6Description('LANCHONETE'), amount: 21.5, date: '2026-10-23T01:31:00.000Z', creditCardMetadata: { billPostDate: '2026-10-23' }
            }),
            // Fatura de dezembro (a aberta): compra de 23/10 lançada em 26/10, depois do fechamento.
            pluggyTransaction({
                description: c6Description('POSTO DE GASOLINA'), amount: 10.99, date: '2026-10-23T12:00:00.000Z', creditCardMetadata: { billPostDate: '2026-10-26' }
            }),
            pluggyTransaction({ description: 'Inclusao de Pagamento Ciclo Corrente', amount: -500, date: '2026-10-25T03:00:00.000Z', operationType: 'PAGAMENTO_FATURA' }),
            // Antes da primeira fatura sincronizada.
            pluggyTransaction({ description: c6Description('MERCADO ANTIGO'), amount: 30, date: '2026-09-10T15:00:00.000Z' })
        ];
        pluggy.bills = [{ id: 'fatura-nov', dueDate: '2026-11-01T00:00:00', billClosingDate: '2026-10-25T00:00:00', totalAmount: 135.5 }];
        service = createService();
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };
    const layout = () => [...expenses.expenses.values()]
        .sort((a, b) => a.month.getTime() - b.month.getTime() || a.originalDescription.localeCompare(b.originalDescription))
        .map(row => [ym(row.month), row.originalDescription, row.installmentNumber]);

    describe('syncCard', () => {
        it('grava as faturas a partir de novembro, com o fechamento do banco, e atualiza a situação do cartão', async () => {
            const result = await service.syncCard(c6.id);

            expect(layout()).toEqual([
                ['2026-11', 'LANCHONETE', null],
                ['2026-11', 'LOJA DE MOVEIS', 3],
                ['2026-12', 'LOJA DE MOVEIS', 4],
                ['2026-12', 'POSTO DE GASOLINA', null],
                ['2027-01', 'LOJA DE MOVEIS', 5]
            ]);
            expect(result).toEqual({
                cardId: c6.id,
                cardName: 'C6',
                summary: { created: 5, updated: 0, unchanged: 0, removed: 0, replacedManual: 0, ignored: 1 },
                error: null,
                sync: {
                    configured: true,
                    syncedAt: expect.any(Date) as Date,
                    dataUpdatedAt: new Date('2026-11-08T14:44:12.000Z'),
                    status: 'UPDATED',
                    error: null,
                    consentExpiresAt: new Date('2027-11-08T14:00:00.000Z')
                }
            });
            expect(cards.get(c6.id).pluggyAccountId).toBe('conta-cartao');
            expect(pluggy.calls).toEqual([`item:${ITEM_ID}`, `accounts:${ITEM_ID}`, 'transactions:conta-cartao:2025-10-01', 'bills:conta-cartao']);
            expect((await cards.findBills(c6.id))[0]).toMatchObject({ month: NOVEMBER, bankClosingDate: day('2026-10-25'), bankDueDate: day('2026-11-01') });
            expect([...expenses.expenses.values()].every(row => row.categoryId === outros.id && row.origin === 'SYNC')).toBe(true);
        });

        it('a segunda vez não muda nada e usa a conta já descoberta', async () => {
            await service.syncCard(c6.id);
            pluggy.calls.length = 0;

            const again = await service.syncCard(c6.id);

            expect(again.summary).toMatchObject({ created: 0, updated: 0, unchanged: 5, removed: 0 });
            expect(pluggy.calls).not.toContain(`accounts:${ITEM_ID}`);
        });

        it('fatura sem fechamento ou anterior ao mês antes do primeiro sincronizado não é gravada', async () => {
            pluggy.bills = [
                { id: 'aberta', dueDate: '2026-12-01T00:00:00', billClosingDate: null },
                { id: 'antiga', dueDate: '2026-09-01T00:00:00', billClosingDate: '2026-08-22T00:00:00' }
            ];

            await service.syncCard(c6.id);

            expect(await cards.findBills(c6.id)).toEqual([]);
        });

        it('item sem dados de atualização e consentimento: a situação fica sem datas', async () => {
            pluggy.item = { id: 'item-1', status: 'LOGIN_ERROR' };

            await expect(service.syncCard(c6.id)).resolves.toMatchObject({
                sync: { status: 'LOGIN_ERROR', dataUpdatedAt: null, consentExpiresAt: null }
            });
        });

        it('cartão sem configuração: 409 CARD_SYNC_NOT_CONFIGURED', async () => {
            const notReady = cards.seed({ name: 'Nubank', dueDay: 2, bestPurchaseDay: 25 });

            await expectAppError(service.syncCard(notReady.id), {
                code: 'CARD_SYNC_NOT_CONFIGURED', statusCode: 409, reason: 'card_sync_settings_missing'
            });
        });

        it('item sem cartão de crédito: 422 e o erro fica gravado no cartão', async () => {
            pluggy.accounts = [{ id: 'conta-corrente', type: 'BANK' }];

            await expectAppError(service.syncCard(c6.id), {
                code: 'CARD_SYNC_NO_CREDIT_ACCOUNT', statusCode: 422, reason: `item_${ITEM_ID}_without_credit_account`
            });
            expect(cards.get(c6.id).syncError).toBe('O item do Meu Pluggy informado não tem cartão de crédito. Confira o id do item no cartão.');
        });

        it('erros da Pluggy viram erros da API: credenciais, item inexistente e indisponibilidade', async () => {
            const cases: Array<[PluggyRequestError, { code: string; statusCode: number; reason: string }]> = [
                [new PluggyRequestError(401, 'CLIENT_KEYS_UNAUTHORIZED', 'x'), { code: 'PLUGGY_AUTH_FAILED', statusCode: 502, reason: 'pluggy_401_CLIENT_KEYS_UNAUTHORIZED' }],
                [new PluggyRequestError(403, 'CLIENT_DISABLED', 'x'), { code: 'PLUGGY_AUTH_FAILED', statusCode: 502, reason: 'pluggy_403_CLIENT_DISABLED' }],
                [new PluggyRequestError(404, 'HTTP_404', 'x'), { code: 'CARD_SYNC_ITEM_NOT_FOUND', statusCode: 422, reason: 'pluggy_404_HTTP_404' }],
                [new PluggyRequestError(0, 'TimeoutError', 'x'), { code: 'PLUGGY_UNAVAILABLE', statusCode: 502, reason: 'pluggy_0_TimeoutError' }]
            ];

            for (const [failure, expected] of cases) {
                pluggy.failure = failure;
                await expectAppError(service.syncCard(c6.id), expected);
            }

            expect(expenses.expenses.size).toBe(0);
        });

        it('erro inesperado passa como veio', async () => {
            const failure = new Error('bug');
            pluggy.failure = failure;

            await expect(service.syncCard(c6.id)).rejects.toBe(failure);
        });
    });

    describe('syncAll', () => {
        it('sincroniza os cartões configurados; o erro de um vai no resultado dele e não para os outros', async () => {
            cards.seed({ name: 'Sem Pluggy' });
            const broken = cards.seed({ name: 'Neon', bank: 'NEON', dueDay: 1, bestPurchaseDay: 27, pluggyItemId: ITEM_ID, syncFromMonth: NOVEMBER });
            // A 1ª consulta (C6) dá certo; a 2ª (Neon) falha.
            pluggy.failures = [null, new PluggyRequestError(503, 'HTTP_503', 'fora do ar')];

            const results = await service.syncAll();

            expect(results.map(result => [result.cardName, result.summary === null, result.error?.code ?? null])).toEqual([
                ['C6', false, null],
                ['Neon', true, 'PLUGGY_UNAVAILABLE']
            ]);
            expect(results[1].sync.error).toBe('A Pluggy não respondeu como esperado. Nada foi alterado; tente de novo em alguns minutos.');
            expect(cards.get(broken.id).syncError).toBe(results[1].sync.error);
        });

        it('erro que não é da API vira PLUGGY_UNAVAILABLE no resultado', async () => {
            pluggy.failure = new Error('bug');

            const [result] = await service.syncAll();

            expect(result.error).toEqual({
                code: 'PLUGGY_UNAVAILABLE',
                message: 'A Pluggy não respondeu como esperado. Nada foi alterado; tente de novo em alguns minutos.'
            });
        });
    });

    describe('verifyCronAuthorization', () => {
        it('aceita só "Bearer <CRON_SECRET>"', () => {
            expect(() => service.verifyCronAuthorization(`Bearer ${CRON_SECRET}`)).not.toThrow();

            for (const header of [undefined, CRON_SECRET, `Bearer ${CRON_SECRET}x`, 'Bearer outro-segredo-qualquer']) {
                expect(() => service.verifyCronAuthorization(header)).toThrow(expect.objectContaining({
                    code: 'CRON_UNAUTHORIZED', statusCode: 401, reason: 'cron_secret_mismatch'
                }) as Error);
            }
        });

        it('sem CRON_SECRET configurado, recusa tudo', () => {
            const withoutSecret = createService({});

            expect(() => withoutSecret.verifyCronAuthorization('Bearer ')).toThrow(expect.objectContaining({
                code: 'CRON_UNAUTHORIZED', reason: 'cron_secret_missing'
            }) as Error);
        });
    });
});
