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
const PUBLIC_KEYS = ['active', 'bank', 'bestPurchaseDay', 'createdAt', 'creditLimit', 'dueDay', 'id', 'name', 'pluggyItemId', 'sync', 'syncFromMonth', 'updatedAt'];
/** Cartão sem ciclo da fatura nem ligação com o Meu Pluggy. */
const NO_SETTINGS = {
    dueDay: null,
    bestPurchaseDay: null,
    pluggyItemId: null,
    syncFromMonth: null,
    creditLimit: null,
    sync: { configured: false, syncedAt: null, dataUpdatedAt: null, status: null, error: null, consentExpiresAt: null }
};
/** O que o service manda ao repositório quando o update não mexe no ciclo nem no Meu Pluggy. */
const NO_SETTINGS_CHANGES = {
    dueDay: undefined, bestPurchaseDay: undefined, pluggyItemId: undefined, pluggyAccountId: undefined, syncFromMonth: undefined, creditLimitCents: undefined
};

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
                syncFromMonth: undefined,
                creditLimitCents: undefined
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
            await repository.saveBankDates(card.id, [{ month: NOVEMBER, closingDate: day('2026-10-26'), dueDate: day('2026-11-03') }]);

            const bills = await service.listBills(card.id, { from: '2026-11', to: '2027-01' });

            expect(bills).toEqual([
                {
                    month: '2026-11', startDate: '2026-09-25', closingDate: '2026-10-25', bestPurchaseDate: '2026-10-26',
                    dueDate: '2026-11-03', source: 'bank', userBestPurchaseDate: null
                },
                {
                    month: '2026-12', startDate: '2026-10-26', closingDate: '2026-11-26', bestPurchaseDate: '2026-11-27',
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

    describe('pagamento da fatura', () => {
        const DECEMBER = day('2026-12-01');
        const PAYMENT_TIME = new Date('2026-11-30T15:00:00.000Z');
        const seedC6 = () => repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25 });

        beforeEach(() => {
            // 30/11: a fatura de dezembro fechou em 24/11 e vence em 01/12; a de janeiro está aberta.
            jest.useFakeTimers({ now: PAYMENT_TIME, doNotFake: ['nextTick', 'setImmediate'] });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('marca a fatura fechada como paga, guardando o total do momento', async () => {
            const card = seedC6();
            repository.billTotals.push({ cardId: card.id, month: DECEMBER, totalCents: 123_456n });

            await expect(service.markBillPaid(card.id, '2026-12')).resolves.toEqual({
                cardId: card.id,
                month: '2026-12',
                status: 'paid',
                total: '1234.56',
                closingDate: '2026-11-24',
                dueDate: '2026-12-01',
                paidAt: PAYMENT_TIME,
                paidAmount: '1234.56',
                changedAfterPayment: false
            });
            expect(repository.bill(card.id, DECEMBER)).toMatchObject({ paidAt: PAYMENT_TIME, paidAmountCents: 123_456n });
        });

        it('fatura sem compras também pode ser paga (total zero)', async () => {
            const card = seedC6();

            await expect(service.markBillPaid(card.id, '2026-12')).resolves.toMatchObject({ status: 'paid', total: '0.00', paidAmount: '0.00' });
        });

        it('marcar de novo confirma o total atual (compra que chegou depois do pagamento)', async () => {
            const card = seedC6();
            const total = { cardId: card.id, month: DECEMBER, totalCents: 10_000n };
            repository.billTotals.push(total);
            await service.markBillPaid(card.id, '2026-12');

            total.totalCents = 15_000n;

            await expect(service.markBillPaid(card.id, '2026-12')).resolves.toMatchObject({ paidAmount: '150.00', changedAfterPayment: false });
            expect(repository.bill(card.id, DECEMBER)?.paidAmountCents).toBe(15_000n);
        });

        it('fatura ainda aberta: 409 CREDIT_CARD_BILL_NOT_CLOSED e nada gravado', async () => {
            const card = seedC6();

            await expectAppError(service.markBillPaid(card.id, '2027-01'), {
                code: 'CREDIT_CARD_BILL_NOT_CLOSED', statusCode: 409, reason: 'bill_2027-01_not_closed'
            });
            expect(repository.bills.size).toBe(0);
        });

        it('desmarca: volta a fechada ou vencida, conforme o vencimento', async () => {
            const card = seedC6();
            await service.markBillPaid(card.id, '2026-12');
            await service.markBillPaid(card.id, '2026-11');

            await expect(service.unmarkBillPaid(card.id, '2026-12')).resolves.toMatchObject({
                status: 'closed', paidAt: null, paidAmount: null, changedAfterPayment: false
            });
            await expect(service.unmarkBillPaid(card.id, '2026-11')).resolves.toMatchObject({ status: 'overdue', dueDate: '2026-11-01' });
            expect(repository.bill(card.id, DECEMBER)).toMatchObject({ paidAt: null, paidAmountCents: null });
        });

        it('desmarcar uma fatura aberta só confirma que ela está aberta', async () => {
            const card = seedC6();

            await expect(service.unmarkBillPaid(card.id, '2027-01')).resolves.toMatchObject({ status: 'open', closingDate: '2026-12-24' });
        });

        it('sem o ciclo configurado: fechada a partir do mês do vencimento, com o vencimento que der para saber', async () => {
            const uploadOnly = repository.seed({ name: 'Neon', bank: 'NEON' });
            const withDueDay = repository.seed({ name: 'Nubank', dueDay: 10 });
            await repository.saveBankDates(uploadOnly.id, [{ month: NOVEMBER, closingDate: day('2026-10-28'), dueDate: day('2026-11-05') }]);

            await expect(service.markBillPaid(uploadOnly.id, '2026-11')).resolves.toMatchObject({
                status: 'paid', closingDate: null, dueDate: '2026-11-05'
            });
            await expect(service.unmarkBillPaid(withDueDay.id, '2026-11')).resolves.toMatchObject({
                status: 'overdue', closingDate: null, dueDate: '2026-11-10'
            });
            await expect(service.unmarkBillPaid(uploadOnly.id, '2026-10')).resolves.toMatchObject({ status: 'closed', dueDate: null });
            await expectAppError(service.markBillPaid(uploadOnly.id, '2026-12'), {
                code: 'CREDIT_CARD_BILL_NOT_CLOSED', statusCode: 409, reason: 'bill_2026-12_not_closed'
            });
        });

        it('cartão inexistente: 404', async () => {
            await expectAppError(service.markBillPaid(MISSING_ID, '2026-12'), NOT_FOUND);
            await expectAppError(service.unmarkBillPaid(MISSING_ID, '2026-12'), NOT_FOUND);
        });
    });

    describe('limite do cartão', () => {
        it('cadastra e altera o limite em reais; null apaga', async () => {
            const created = await service.create({ name: 'C6', bank: 'C6', creditLimit: '8000' });

            expect(created.creditLimit).toBe('8000.00');
            expect(repository.get(created.id).creditLimitCents).toBe(800_000n);
            await expect(service.update(created.id, { creditLimit: '9500.5' })).resolves.toMatchObject({ creditLimit: '9500.50' });
            await expect(service.update(created.id, { creditLimit: null })).resolves.toMatchObject({ creditLimit: null });
            expect(repository.get(created.id).creditLimitCents).toBeNull();
        });

        it('limite zero: 400 CREDIT_CARD_INVALID_AMOUNT, sem gravar', async () => {
            const card = repository.seed({ name: 'C6', creditLimitCents: 100n });
            const invalid = { code: 'CREDIT_CARD_INVALID_AMOUNT', statusCode: 400, reason: 'credit_card_limit_invalid' };

            await expectAppError(service.create({ name: 'Nubank', bank: 'NUBANK', creditLimit: '0' }), invalid);
            await expectAppError(service.update(card.id, { creditLimit: '0.00' }), invalid);
            expect(repository.cards.size).toBe(1);
            expect(repository.get(card.id).creditLimitCents).toBe(100n);
        });
    });

    describe('resumo das faturas do mês', () => {
        const month = (value: string): Date => day(`${value}-01`);

        beforeEach(() => {
            // 30/11: a fatura de dezembro do C6 fechou em 24/11; o limite conta as faturas de novembro em diante.
            jest.useFakeTimers({ now: new Date('2026-11-30T15:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('um item por cartão (ativos e inativos com compras), total geral e limite disponível', async () => {
            const c6 = repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25, creditLimitCents: 500_000n });
            const nubank = repository.seed({ name: 'Nubank' });
            const old = repository.seed({ name: 'Antigo', active: false });
            repository.seed({ name: 'Cancelado', active: false });
            repository.billTotals.push(
                { cardId: c6.id, month: month('2026-10'), totalCents: 40_000n },
                { cardId: c6.id, month: month('2026-11'), totalCents: 80_000n },
                { cardId: c6.id, month: month('2026-12'), totalCents: 100_000n },
                { cardId: c6.id, month: month('2027-01'), totalCents: 30_000n },
                { cardId: c6.id, month: month('2027-02'), totalCents: 20_000n },
                { cardId: nubank.id, month: month('2026-12'), totalCents: 25_050n },
                { cardId: old.id, month: month('2026-12'), totalCents: 4_950n }
            );
            await repository.savePayment(c6.id, month('2026-11'), { paidAt: new Date('2026-11-02T10:00:00.000Z'), paidAmountCents: 80_000n });

            const summary = await service.summarizeBills('2026-12');

            expect(summary.month).toBe('2026-12');
            expect(summary.total).toBe('1300.00');
            expect(summary.cards.map(card => card.cardName)).toEqual(['Antigo', 'C6', 'Nubank']);
            expect(summary.cards[1]).toEqual({
                cardId: c6.id,
                cardName: 'C6',
                bank: 'C6',
                active: true,
                month: '2026-12',
                status: 'closed',
                total: '1000.00',
                closingDate: '2026-11-24',
                dueDate: '2026-12-01',
                paidAt: null,
                paidAmount: null,
                changedAfterPayment: false,
                creditLimit: '5000.00',
                // 5000 − (dezembro 1000 + janeiro 300 + fevereiro 200): novembro foi paga e outubro já venceu.
                availableLimit: '3500.00'
            });
            expect(summary.cards[0]).toMatchObject({ active: false, total: '49.50', creditLimit: null, availableLimit: null });
            expect(summary.cards[2]).toMatchObject({ status: 'open', total: '250.50', closingDate: null, dueDate: null });
        });

        it('fatura paga que mudou depois avisa; limite estourado fica negativo', async () => {
            const c6 = repository.seed({ name: 'C6', bank: 'C6', dueDay: 1, bestPurchaseDay: 25, creditLimitCents: 50_000n });
            repository.billTotals.push(
                { cardId: c6.id, month: month('2026-12'), totalCents: 100_000n },
                { cardId: c6.id, month: month('2027-01'), totalCents: 60_000n }
            );
            await repository.savePayment(c6.id, month('2026-12'), { paidAt: new Date('2026-11-28T10:00:00.000Z'), paidAmountCents: 90_000n });

            const [item] = (await service.summarizeBills('2026-12')).cards;

            expect(item).toMatchObject({
                status: 'paid', total: '1000.00', paidAmount: '900.00', changedAfterPayment: true, availableLimit: '-100.00'
            });
        });

        it('mês sem compras: os cartões ativos com total zero', async () => {
            repository.seed({ name: 'Nubank' });

            await expect(service.summarizeBills('2027-06')).resolves.toMatchObject({
                total: '0.00', cards: [{ cardName: 'Nubank', total: '0.00', status: 'open' }]
            });
        });
    });
});
