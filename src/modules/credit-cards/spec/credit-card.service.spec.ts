import type { AppError } from '../../common/errors/app-error.js';
import { jest } from '@jest/globals';

import { CreditCardRepository } from '../repository/credit-card.repository.js';
import { CreditCardService, isSyncConfigured } from '../service/credit-card.service.js';
import { InMemoryCreditCardRepository } from './in-memory-credit-card.repository.js';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const ITEM_ID = '0b7c5a52-3d4e-4f6a-8b9c-0d1e2f3a4b5c';
const CREATED_AT = new Date('2026-03-01T12:00:00.000Z');
const UPDATED_AT = new Date('2026-03-02T08:30:00.000Z');
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const PUBLIC_KEYS = ['active', 'bank', 'bestPurchaseDay', 'createdAt', 'dueDay', 'id', 'name', 'pluggyItemId', 'sync', 'syncFromMonth', 'updatedAt'];
/** Cartão sem ciclo da fatura nem ligação com o Meu Pluggy. */
const NO_SETTINGS = {
    dueDay: null,
    bestPurchaseDay: null,
    pluggyItemId: null,
    syncFromMonth: null,
    sync: { configured: false, syncedAt: null, dataUpdatedAt: null, status: null, error: null, consentExpiresAt: null }
};
/** O que o service manda ao repositório quando o update não mexe no ciclo nem no Meu Pluggy. */
const NO_SETTINGS_CHANGES = { dueDay: undefined, bestPurchaseDay: undefined, pluggyItemId: undefined, pluggyAccountId: undefined, syncFromMonth: undefined };

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Regras do cadastro de cartões e do calendário de faturas, com o repositório em memória no lugar do banco. */
describe('CreditCardService', () => {
    let repository: InMemoryCreditCardRepository;
    let service: CreditCardService;

    beforeEach(() => {
        repository = new InMemoryCreditCardRepository();
        service = new CreditCardService(repository as unknown as CreditCardRepository);
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    const NOT_FOUND = { code: 'CREDIT_CARD_NOT_FOUND', statusCode: 404, reason: 'credit_card_id_not_found' };

    describe('create', () => {
        it('tira espaços sobrando do nome (início, fim e repetidos) e grava com o banco escolhido', async () => {
            const create = jest.spyOn(repository, 'create');

            const created = await service.create({ name: '  Nubank \t  Mikaell   Silva ', bank: 'NUBANK' });

            expect(create).toHaveBeenCalledWith({
                name: 'Nubank Mikaell Silva',
                bank: 'NUBANK',
                dueDay: undefined,
                bestPurchaseDay: undefined,
                pluggyItemId: undefined,
                syncFromMonth: undefined
            });
            expect(created).toMatchObject({ name: 'Nubank Mikaell Silva', bank: 'NUBANK', active: true });
            expect(Object.keys(created).sort()).toEqual(PUBLIC_KEYS);
        });

        it('aceita os três bancos', async () => {
            for (const bank of ['NUBANK', 'C6', 'NEON'] as const) {
                await expect(service.create({ name: `Cartão ${bank}`, bank })).resolves.toMatchObject({ bank });
            }

            expect(repository.cards.size).toBe(3);
        });

        it('grava vencimento, melhor dia, item do Meu Pluggy e a primeira fatura sincronizada', async () => {
            const created = await service.create({
                name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: '2026-11'
            });

            expect(created).toMatchObject({
                dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: '2026-11', sync: { configured: true }
            });
            expect(repository.get(created.id).syncFromMonth).toEqual(NOVEMBER);
        });
    });

    describe('findAll', () => {
        it('lista só os ativos, por nome', async () => {
            repository.seed({ name: 'Neon', bank: 'NEON' });
            repository.seed({ name: 'Antigo', active: false });
            repository.seed({ name: 'C6 Ayanne', bank: 'C6' });

            const names = (await service.findAll()).map(card => card.name);

            expect(names).toEqual(['C6 Ayanne', 'Neon']);
        });

        it('devolve cada cartão só com os campos públicos', async () => {
            const card = repository.seed({ name: 'Neon', bank: 'NEON', createdAt: CREATED_AT, updatedAt: UPDATED_AT });

            await expect(service.findAll()).resolves.toEqual([{
                id: card.id, name: 'Neon', bank: 'NEON', active: true, ...NO_SETTINGS, createdAt: CREATED_AT, updatedAt: UPDATED_AT
            }]);
        });
    });

    describe('findById e getById', () => {
        it('findById devolve o cartão, ativo ou não, só com os campos públicos', async () => {
            const card = repository.seed({ name: 'Antigo', bank: 'C6', active: false, createdAt: CREATED_AT, updatedAt: UPDATED_AT });

            await expect(service.findById(card.id)).resolves.toEqual({
                id: card.id, name: 'Antigo', bank: 'C6', active: false, ...NO_SETTINGS, createdAt: CREATED_AT, updatedAt: UPDATED_AT
            });
        });

        it('getById devolve o registro do banco como veio', async () => {
            const card = repository.seed({ name: 'Nubank' });

            await expect(service.getById(card.id)).resolves.toBe(card);
        });

        it('id inexistente: 404 CREDIT_CARD_NOT_FOUND', async () => {
            await expectAppError(service.findById(MISSING_ID), NOT_FOUND);
            await expectAppError(service.getById(MISSING_ID), NOT_FOUND);
        });
    });

    describe('getActiveById', () => {
        it('devolve o cartão ativo', async () => {
            const card = repository.seed({ name: 'Nubank' });

            await expect(service.getActiveById(card.id)).resolves.toBe(card);
        });

        it('cartão inativo: 409 CREDIT_CARD_INACTIVE', async () => {
            const card = repository.seed({ name: 'Antigo', active: false });

            await expectAppError(service.getActiveById(card.id), {
                code: 'CREDIT_CARD_INACTIVE', statusCode: 409, reason: 'credit_card_inactive'
            });
        });

        it('id inexistente: 404', async () => {
            await expectAppError(service.getActiveById(MISSING_ID), NOT_FOUND);
        });
    });

    describe('update', () => {
        it('renomeia normalizando o nome, sem mexer no estado', async () => {
            const card = repository.seed({ name: 'Nubank', bank: 'NUBANK' });
            const update = jest.spyOn(repository, 'update');

            const updated = await service.update(card.id, { name: '  Nubank   Ayanne ' });

            expect(update).toHaveBeenCalledWith(card.id, { name: 'Nubank Ayanne', active: undefined, ...NO_SETTINGS_CHANGES });
            expect(updated).toMatchObject({ id: card.id, name: 'Nubank Ayanne', bank: 'NUBANK', active: true });
            expect(Object.keys(updated).sort()).toEqual(PUBLIC_KEYS);
        });

        it('desativa e reativa sem mexer no nome', async () => {
            const card = repository.seed({ name: 'Nubank' });
            const update = jest.spyOn(repository, 'update');

            await expect(service.update(card.id, { active: false })).resolves.toMatchObject({ name: 'Nubank', active: false });
            await expect(service.update(card.id, { active: true })).resolves.toMatchObject({ name: 'Nubank', active: true });
            expect(update).toHaveBeenNthCalledWith(1, card.id, { name: undefined, active: false, ...NO_SETTINGS_CHANGES });
        });

        it('trocar o item apaga a conta descoberta; o mesmo item a mantém; null desliga a sincronização', async () => {
            const card = repository.seed({ name: 'C6', pluggyItemId: ITEM_ID, pluggyAccountId: 'conta-1', syncFromMonth: NOVEMBER });

            await service.update(card.id, { pluggyItemId: ITEM_ID, dueDay: 2, bestPurchaseDay: 26 });
            expect(repository.get(card.id)).toMatchObject({ pluggyAccountId: 'conta-1', dueDay: 2, bestPurchaseDay: 26 });

            await service.update(card.id, { pluggyItemId: MISSING_ID, syncFromMonth: '2026-12' });
            expect(repository.get(card.id)).toMatchObject({ pluggyItemId: MISSING_ID, pluggyAccountId: null, syncFromMonth: day('2026-12-01') });

            await service.update(card.id, { pluggyItemId: null, syncFromMonth: null });
            expect(repository.get(card.id)).toMatchObject({ pluggyItemId: null, syncFromMonth: null });
        });

        it('id inexistente: 404 sem tentar gravar', async () => {
            const update = jest.spyOn(repository, 'update');

            await expectAppError(service.update(MISSING_ID, { active: false }), NOT_FOUND);
            expect(update).not.toHaveBeenCalled();
        });

        it('erros do banco no update passam como vieram', async () => {
            const card = repository.seed({ name: 'Nubank' });
            const failure = new Error('conexão caiu');
            jest.spyOn(repository, 'update').mockRejectedValueOnce(failure);

            await expect(service.update(card.id, { name: 'Outro' })).rejects.toBe(failure);
        });
    });

    describe('sincronização no cadastro', () => {
        it('findSyncable: só os ativos com item, vencimento, melhor dia e primeira fatura', async () => {
            const ready = repository.seed({ name: 'C6', dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: NOVEMBER });
            repository.seed({ name: 'Sem item', dueDay: 1, bestPurchaseDay: 25, syncFromMonth: NOVEMBER });
            repository.seed({ name: 'Sem dias', pluggyItemId: ITEM_ID, syncFromMonth: NOVEMBER });
            repository.seed({ name: 'Sem mês', dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID });
            repository.seed({ name: 'Inativo', active: false, dueDay: 1, bestPurchaseDay: 25, pluggyItemId: ITEM_ID, syncFromMonth: NOVEMBER });

            expect((await service.findSyncable()).map(card => card.id)).toEqual([ready.id]);
            expect(isSyncConfigured(ready)).toBe(true);
        });

        it('updateSyncState grava a situação, que aparece em sync', async () => {
            const card = repository.seed({ name: 'C6' });
            const syncedAt = new Date('2026-11-08T17:00:00.000Z');

            await service.updateSyncState(card.id, { syncedAt, syncStatus: 'UPDATED', syncError: null });

            await expect(service.findById(card.id)).resolves.toMatchObject({
                sync: { configured: false, syncedAt, status: 'UPDATED', error: null }
            });
        });
    });

    describe('faturas', () => {
        const seedC6 = () => repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25 });

        it('sem vencimento ou melhor dia: 409 CREDIT_CARD_BILLING_NOT_CONFIGURED', async () => {
            const card = repository.seed({ name: 'Sem ciclo', dueDay: 1 });

            await expectAppError(service.listBills(card.id, {}), {
                code: 'CREDIT_CARD_BILLING_NOT_CONFIGURED', statusCode: 409, reason: 'credit_card_billing_days_missing'
            });
        });

        it('lista início, fechamento, melhor dia e vencimento; fechamento do banco e ajuste do usuário prevalecem', async () => {
            const card = seedC6();
            await repository.saveBestPurchaseDate(card.id, day('2026-12-01'), day('2026-11-27'));
            await repository.saveBankDates(card.id, [{ month: NOVEMBER, closingDate: day('2026-10-22'), dueDate: day('2026-11-03') }]);

            const bills = await service.listBills(card.id, { from: '2026-11', to: '2027-01' });

            expect(bills).toEqual([
                {
                    month: '2026-11', startDate: '2026-09-25', closingDate: '2026-10-22', bestPurchaseDate: '2026-10-23',
                    dueDate: '2026-11-03', source: 'bank', userBestPurchaseDate: null
                },
                {
                    month: '2026-12', startDate: '2026-10-23', closingDate: '2026-11-26', bestPurchaseDate: '2026-11-27',
                    dueDate: '2026-12-01', source: 'user', userBestPurchaseDate: '2026-11-27'
                },
                {
                    month: '2027-01', startDate: '2026-11-27', closingDate: '2026-12-24', bestPurchaseDate: '2026-12-25',
                    dueDate: '2027-01-01', source: 'default', userBestPurchaseDate: null
                }
            ]);
        });

        it('sem período: da anterior à aberta até duas depois dela (hoje no horário de Brasília)', async () => {
            const card = seedC6();
            jest.useFakeTimers({ now: new Date('2026-11-25T02:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });

            try {
                // 24/11 às 23h em Brasília: a compra ainda é da fatura de dezembro.
                expect((await service.listBills(card.id, {})).map(bill => bill.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
            } finally {
                jest.useRealTimers();
            }
        });

        it('período invertido ou com mais de 24 faturas: 400 CREDIT_CARD_BILL_RANGE_INVALID', async () => {
            const card = seedC6();

            await expectAppError(service.listBills(card.id, { from: '2026-12', to: '2026-11' }), {
                code: 'CREDIT_CARD_BILL_RANGE_INVALID', statusCode: 400, reason: 'bill_range_0'
            });
            await expectAppError(service.listBills(card.id, { from: '2026-01', to: '2028-01' }), {
                code: 'CREDIT_CARD_BILL_RANGE_INVALID', statusCode: 400, reason: 'bill_range_25'
            });
        });

        it('updateBill ajusta o melhor dia da fatura; null volta ao padrão', async () => {
            const card = seedC6();

            await expect(service.updateBill(card.id, '2026-12', { bestPurchaseDate: '2026-11-24' })).resolves.toMatchObject({
                month: '2026-12', bestPurchaseDate: '2026-11-24', closingDate: '2026-11-23', source: 'user'
            });
            await expect(service.updateBill(card.id, '2026-12', { bestPurchaseDate: null })).resolves.toMatchObject({
                bestPurchaseDate: '2026-11-25', source: 'default', userBestPurchaseDate: null
            });
        });

        it('updateBill: data fora do mês anterior e do mês da fatura é 422', async () => {
            const card = seedC6();

            for (const date of ['2026-09-30', '2026-12-01']) {
                await expectAppError(service.updateBill(card.id, '2026-11', { bestPurchaseDate: date }), {
                    code: 'CREDIT_CARD_BILL_DATE_OUT_OF_RANGE', statusCode: 422, reason: `best_purchase_date_${date}_for_2026-11`
                });
            }
        });

        it('saveBankBillDates grava fechamento e vencimento; lista vazia não grava nada', async () => {
            const card = seedC6();
            const save = jest.spyOn(repository, 'saveBankDates');

            await service.saveBankBillDates(card.id, []);
            await service.saveBankBillDates(card.id, [{ month: NOVEMBER, closingDate: day('2026-10-22'), dueDate: day('2026-11-01') }]);

            expect(save).toHaveBeenCalledTimes(1);
            expect((await service.getCalendar(card)).schedule(NOVEMBER).source).toBe('bank');
        });
    });
});
