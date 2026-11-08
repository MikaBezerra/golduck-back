import type { Category, CreditCard, Person } from '../../../generated/prisma/client.js';
import type { CategoryRepository } from '../../categories/repository/category.repository.js';
import type { AppError } from '../../common/errors/app-error.js';
import type { CreditCardRepository } from '../../credit-cards/repository/credit-card.repository.js';
import type { PersonRepository } from '../../people/repository/person.repository.js';
import type { CardExpenseRepository } from '../repository/card-expense.repository.js';
import type { CardExpenseScope } from '../service/card-expense-scope.js';
import { jest } from '@jest/globals';

import { CategoryService } from '../../categories/service/category.service.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { CreditCardService } from '../../credit-cards/service/credit-card.service.js';
import { InMemoryCreditCardRepository } from '../../credit-cards/spec/in-memory-credit-card.repository.js';
import { FakePersonRepository } from '../../manual-expenses/spec/fake-person.repository.js';
import { PersonService } from '../../people/service/person.service.js';
import { CardExpenseService } from '../service/card-expense.service.js';
import { CARD_ID, InMemoryCardExpenseRepository } from './in-memory-card-expense.repository.js';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const OTHER_CARD_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SEPTEMBER = new Date('2026-09-01T00:00:00.000Z');
const OCTOBER = new Date('2026-10-01T00:00:00.000Z');
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const NOW = new Date('2026-11-07T12:00:00.000Z');

/**
 * Regras das despesas do cartão (apelido, categoria, pessoa, exclusão suave e restauração), com
 * repositórios em memória no lugar do banco. Categorias e pessoas passam pelos serviços de verdade.
 */
describe('CardExpenseService', () => {
    let categories: InMemoryCategoryRepository;
    let people: FakePersonRepository;
    let repository: InMemoryCardExpenseRepository;
    let service: CardExpenseService;
    let cards: InMemoryCreditCardRepository;
    let card: CreditCard;
    let outros: Category;
    let mercado: Category;
    let ana: Person;

    beforeEach(() => {
        categories = new InMemoryCategoryRepository();
        people = new FakePersonRepository();
        repository = new InMemoryCardExpenseRepository();
        cards = new InMemoryCreditCardRepository();
        card = cards.seed({ id: CARD_ID, name: 'C6', bank: 'C6', syncFromMonth: OCTOBER });
        service = new CardExpenseService(
            repository as unknown as CardExpenseRepository,
            new CategoryService(categories as unknown as CategoryRepository),
            new PersonService(people as unknown as PersonRepository),
            new CreditCardService(cards as unknown as CreditCardRepository)
        );
        outros = categories.seed({ name: 'Outros', isDefault: true });
        mercado = categories.seed({ name: 'Mercado' });
        ana = people.seed({ name: 'Ana' });
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    /** Uma compra parcelada em 4 vezes, de setembro a dezembro. */
    const seedFourInstallments = (): ReturnType<InMemoryCardExpenseRepository['seedInstallments']> =>
        repository.seedInstallments(SEPTEMBER, 4, { categoryId: outros.id, purchaseKey: 'P|2026-09|4|TV', originalDescription: 'TV' });

    describe('findAll', () => {
        it('lista as do mês, sem as excluídas, por data da compra e descrição', async () => {
            const findAll = jest.spyOn(repository, 'findAll');
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'PADARIA', transactionDate: new Date('2026-09-20T00:00:00.000Z') });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'MERCADO', transactionDate: new Date('2026-09-20T00:00:00.000Z') });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'FARMACIA', transactionDate: new Date('2026-09-25T00:00:00.000Z') });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'EXCLUIDA', excludedAt: NOW });
            repository.seed({ month: NOVEMBER, categoryId: outros.id, originalDescription: 'OUTRO MES' });

            const expenses = await service.findAll({ month: '2026-10', includeExcluded: false });

            expect(expenses.map(expense => expense.description)).toEqual(['MERCADO', 'PADARIA', 'FARMACIA']);
            expect(expenses.every(expense => expense.month === '2026-10' && !expense.excluded)).toBe(true);
            expect(findAll).toHaveBeenCalledWith({ month: OCTOBER, cardId: undefined, includeExcluded: false });
        });

        it('com includeExcluded, traz também as excluídas (marcadas como excluded)', async () => {
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'ATIVA' });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'EXCLUIDA', excludedAt: NOW });

            const expenses = await service.findAll({ month: '2026-10', includeExcluded: true });

            expect(expenses.map(expense => [expense.description, expense.excluded])).toEqual([['ATIVA', false], ['EXCLUIDA', true]]);
        });

        it('filtra pelo cartão quando cardId vem', async () => {
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'CARTAO 1' });
            repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'CARTAO 2', cardId: OTHER_CARD_ID });
            const findAll = jest.spyOn(repository, 'findAll');

            const expenses = await service.findAll({ month: '2026-10', cardId: OTHER_CARD_ID, includeExcluded: false });

            expect(expenses.map(expense => expense.description)).toEqual(['CARTAO 2']);
            expect(findAll).toHaveBeenCalledWith({ month: OCTOBER, cardId: OTHER_CARD_ID, includeExcluded: false });
        });
    });

    describe('findById', () => {
        it('devolve a despesa no formato da API', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: mercado.id, nickname: 'Feira', amountCents: 4590n });

            await expect(service.findById(expense.id)).resolves.toMatchObject({
                id: expense.id, month: '2026-10', description: 'Feira', amount: '45.90', categoryId: mercado.id, excluded: false
            });
        });

        it('id inexistente: 404 CARD_EXPENSE_NOT_FOUND', async () => {
            await expectAppError(service.findById(MISSING_ID), {
                code: 'CARD_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'card_expense_id_not_found'
            });
        });
    });

    describe('updateMany', () => {
        it('apelido numa compra à vista: só ela muda, sem consultar categorias nem pessoas', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: mercado.id, personId: ana.id, originalDescription: 'PAG*JOSE' });
            const other = repository.seed({ month: OCTOBER, categoryId: mercado.id, originalDescription: 'PAG*JOSE' });
            const update = jest.spyOn(repository, 'updateWithFollowingInstallments');
            const findCategory = jest.spyOn(categories, 'findById');
            const findPerson = jest.spyOn(people, 'findById');

            const updated = await service.updateMany({ ids: [expense.id], changes: { nickname: 'Pão' } });

            expect(updated).toHaveLength(1);
            expect(updated[0]).toMatchObject({
                id: expense.id, description: 'Pão', nickname: 'Pão', originalDescription: 'PAG*JOSE', categoryId: mercado.id, personId: ana.id
            });
            expect(repository.get(other.id).nickname).toBeNull();
            expect(update).toHaveBeenCalledWith([expense], {
                nickname: 'Pão', categoryId: undefined, personId: undefined
            });
            expect(findCategory).not.toHaveBeenCalled();
            expect(findPerson).not.toHaveBeenCalled();
        });

        it('em compra parcelada, vale para a parcela escolhida e as seguintes (não as anteriores)', async () => {
            const [first, second, third, fourth] = seedFourInstallments();

            const updated = await service.updateMany({ ids: [second.id], changes: { categoryId: mercado.id } });

            expect(updated.map(expense => [expense.id, expense.installment])).toEqual([
                [second.id, { number: 2, total: 4 }],
                [third.id, { number: 3, total: 4 }],
                [fourth.id, { number: 4, total: 4 }]
            ]);
            expect(updated.every(expense => expense.categoryId === mercado.id)).toBe(true);
            expect(repository.get(first.id).categoryId).toBe(outros.id);
        });

        it('apelido null remove o apelido (a descrição volta a ser a do banco)', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'NETFLIX.COM', nickname: 'Netflix' });

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { nickname: null } });

            expect(updated).toMatchObject({ nickname: null, description: 'NETFLIX.COM' });
        });

        it('troca a pessoa; split SHARED torna a despesa compartilhada sem consultar pessoas', async () => {
            const first = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const second = repository.seed({ month: OCTOBER, categoryId: outros.id, personId: ana.id });

            const [individual] = await service.updateMany({ ids: [first.id], changes: { split: 'PERSONAL', personId: ana.id } });
            const findPerson = jest.spyOn(people, 'findById');
            const [shared] = await service.updateMany({ ids: [second.id], changes: { split: 'SHARED', personId: null } });

            expect(individual).toMatchObject({ split: 'PERSONAL', personId: ana.id });
            expect(shared).toMatchObject({ split: 'SHARED', personId: null });
            expect(findPerson).not.toHaveBeenCalled();
        });

        it('classificar uma compra pendente tira ela (e as parcelas seguintes) de PENDING', async () => {
            const [first, second, third] = repository.seedInstallments(SEPTEMBER, 3, {
                categoryId: outros.id, purchaseKey: 'P|2026-09|3|LOJA', split: 'PENDING'
            });

            const updated = await service.updateMany({ ids: [second.id], changes: { split: 'SHARED' } });

            expect(updated.map(row => row.id).sort()).toEqual([second.id, third.id].sort());
            expect(repository.get(first.id).split).toBe('PENDING');
            expect(repository.get(second.id).split).toBe('SHARED');
            expect(repository.get(third.id).split).toBe('SHARED');
        });

        it('sem split, a pessoa (e o PENDING) fica como estava', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, split: 'PENDING' });

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { nickname: 'Café' } });

            expect(updated).toMatchObject({ nickname: 'Café', split: 'PENDING', personId: null });
        });

        it('altera várias despesas de uma vez e devolve todas as linhas alteradas', async () => {
            const single = repository.seed({ month: OCTOBER, categoryId: outros.id, originalDescription: 'A' });
            const [, second, third] = repository.seedInstallments(SEPTEMBER, 3, { categoryId: outros.id, purchaseKey: 'P|2026-09|3|B' });

            const updated = await service.updateMany({ ids: [single.id, second.id], changes: { split: 'PERSONAL', personId: ana.id, nickname: 'Junto' } });

            expect(updated.map(expense => expense.id).sort()).toEqual([single.id, second.id, third.id].sort());
            expect(updated.every(expense => expense.personId === ana.id && expense.description === 'Junto')).toBe(true);
        });

        it('categoria inativa ou pessoa inativa: 409, sem alterar nada', async () => {
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const bia = people.seed({ name: 'Bia', active: false });
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const update = jest.spyOn(repository, 'updateWithFollowingInstallments');

            await expectAppError(service.updateMany({ ids: [expense.id], changes: { categoryId: antiga.id } }), {
                code: 'CARD_EXPENSE_INACTIVE_CATEGORY', statusCode: 409, reason: 'category_inactive'
            });
            await expectAppError(service.updateMany({ ids: [expense.id], changes: { split: 'PERSONAL', personId: bia.id } }), {
                code: 'CARD_EXPENSE_INACTIVE_PERSON', statusCode: 409, reason: 'person_inactive'
            });
            expect(update).not.toHaveBeenCalled();
            expect(repository.get(expense.id)).toMatchObject({ categoryId: outros.id, personId: null });
        });

        it('categoria ou pessoa inexistente: 404 do cadastro correspondente', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });

            await expectAppError(service.updateMany({ ids: [expense.id], changes: { categoryId: MISSING_ID } }), {
                code: 'CATEGORY_NOT_FOUND', statusCode: 404, reason: 'category_id_not_found'
            });
            await expectAppError(service.updateMany({ ids: [expense.id], changes: { split: 'PERSONAL', personId: MISSING_ID } }), {
                code: 'PERSON_NOT_FOUND', statusCode: 404, reason: 'person_id_not_found'
            });
        });

        it('um id inexistente: 404 CARD_EXPENSE_NOT_FOUND, antes de validar ou alterar qualquer coisa', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const update = jest.spyOn(repository, 'updateWithFollowingInstallments');
            const findCategory = jest.spyOn(categories, 'findById');

            await expectAppError(service.updateMany({ ids: [expense.id, MISSING_ID], changes: { categoryId: mercado.id } }), {
                code: 'CARD_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'card_expense_id_not_found'
            });
            expect(update).not.toHaveBeenCalled();
            expect(findCategory).not.toHaveBeenCalled();
        });
    });

    describe('exclude e restore', () => {
        beforeEach(() => {
            jest.useFakeTimers({ now: NOW });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('compra à vista: exclui só a própria linha, qualquer que seja o escopo', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, exclusionRemembered: true });
            const other = repository.seed({ month: OCTOBER, categoryId: outros.id });

            await expect(service.exclude({ ids: [expense.id], scope: 'all' })).resolves.toBeUndefined();

            expect(repository.get(expense.id)).toMatchObject({ excludedAt: NOW, exclusionRemembered: false });
            expect(repository.get(other.id).excludedAt).toBeNull();
        });

        it.each<[CardExpenseScope, number[]]>([
            ['month', [2]],
            ['forward', [2, 3, 4]],
            ['backward', [1, 2]],
            ['all', [1, 2, 3, 4]]
        ])('compra parcelada com escopo %s, a partir da 2ª parcela: exclui as parcelas %j', async (scope, excluded) => {
            const installments = seedFourInstallments();
            const exclude = jest.spyOn(repository, 'exclude');

            await service.exclude({ ids: [installments[1].id], scope });

            const excludedNumbers = installments
                .filter(installment => repository.get(installment.id).excludedAt !== null)
                .map(installment => installment.installmentNumber);
            expect(excludedNumbers).toEqual(excluded);
            expect(exclude).toHaveBeenCalledWith([installments[1]], scope);
        });

        it('excluir de novo mantém a data da primeira exclusão', async () => {
            const firstExclusion = new Date('2026-10-05T10:00:00.000Z');
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, excludedAt: firstExclusion });

            await service.exclude({ ids: [expense.id], scope: 'month' });

            expect(repository.get(expense.id).excludedAt).toEqual(firstExclusion);
        });

        it('um id inexistente: 404 e nada é excluído', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id });
            const exclude = jest.spyOn(repository, 'exclude');

            await expectAppError(service.exclude({ ids: [expense.id, MISSING_ID], scope: 'month' }), {
                code: 'CARD_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'card_expense_id_not_found'
            });
            expect(exclude).not.toHaveBeenCalled();
            expect(repository.get(expense.id).excludedAt).toBeNull();
        });

        it('restaura as excluídas do escopo e devolve só elas, já sem a marca de excluída', async () => {
            const [first, second, third, fourth] = seedFourInstallments();
            await service.exclude({ ids: [first.id], scope: 'all' });
            repository.expenses.set(fourth.id, { ...repository.get(fourth.id), excludedAt: null });

            const restored = await service.restore({ ids: [second.id], scope: 'forward' });

            expect(restored.map(expense => [expense.id, expense.excluded])).toEqual([[second.id, false], [third.id, false]]);
            expect(repository.get(first.id).excludedAt).toEqual(NOW);
            expect(repository.get(second.id)).toMatchObject({ excludedAt: null, exclusionRemembered: false });
        });

        it('compra à vista: restaura só a própria linha', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, excludedAt: NOW, exclusionRemembered: true });
            const other = repository.seed({ month: OCTOBER, categoryId: outros.id, excludedAt: NOW });

            const restored = await service.restore({ ids: [expense.id], scope: 'all' });

            expect(restored.map(row => row.id)).toEqual([expense.id]);
            expect(repository.get(expense.id)).toMatchObject({ excludedAt: null, exclusionRemembered: false });
            expect(repository.get(other.id).excludedAt).toEqual(NOW);
        });

        it('restaurar um id inexistente: 404 e nada muda', async () => {
            const expense = repository.seed({ month: OCTOBER, categoryId: outros.id, excludedAt: NOW });
            const restore = jest.spyOn(repository, 'restore');

            await expectAppError(service.restore({ ids: [MISSING_ID, expense.id], scope: 'all' }), {
                code: 'CARD_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'card_expense_id_not_found'
            });
            expect(restore).not.toHaveBeenCalled();
            expect(repository.get(expense.id).excludedAt).toEqual(NOW);
        });
    });

    describe('create ("Adicionar compra")', () => {
        const DECEMBER = new Date('2026-12-01T00:00:00.000Z');

        it('à vista: uma linha MANUAL no mês, com a categoria padrão e a descrição sem espaços sobrando', async () => {
            const created = await service.create({
                cardId: card.id, month: '2026-12', date: '2026-11-06', description: '  Padaria   do  bairro ', amount: '12.50', split: 'SHARED'
            });

            expect(created).toEqual([expect.objectContaining({
                cardId: card.id,
                importId: null,
                origin: 'MANUAL',
                month: '2026-12',
                transactionDate: '2026-11-06',
                description: 'Padaria do bairro',
                amount: '12.50',
                installment: null,
                categoryId: outros.id,
                split: 'SHARED',
                personId: null,
                excluded: false
            })]);
            expect(repository.get(created[0].id).purchaseKey).toMatch(/^M\|/);
            expect(repository.get(created[0].id).sourceMonth).toEqual(DECEMBER);
        });

        it('parcelada: a parcela informada no mês e as seguintes nos meses seguintes, com apelido, categoria e pessoa', async () => {
            const created = await service.create({
                cardId: card.id,
                month: '2026-12',
                date: '2026-10-03',
                description: 'Loja',
                amount: '100.00',
                installment: { number: 3, total: 5 },
                nickname: 'Cadeira',
                categoryId: mercado.id,
                split: 'PERSONAL',
                personId: ana.id
            });

            expect(created.map(row => [row.month, row.installment])).toEqual([
                ['2026-12', { number: 3, total: 5 }],
                ['2027-01', { number: 4, total: 5 }],
                ['2027-02', { number: 5, total: 5 }]
            ]);
            expect(created.every(row => row.nickname === 'Cadeira' && row.categoryId === mercado.id && row.personId === ana.id)).toBe(true);
            expect(new Set(created.map(row => repository.get(row.id).purchaseKey)).size).toBe(1);
            expect(repository.get(created[0].id).sourceMonth).toEqual(OCTOBER);
        });

        it('SHARED com personId null é compartilhada; cartão inativo e categoria inativa são 409', async () => {
            const inactiveCard = cards.seed({ name: 'Antigo', active: false });
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const base = { cardId: card.id, month: '2026-12', date: '2026-11-06', description: 'X', amount: '1.00', split: 'SHARED' as const };

            await expect(service.create({ ...base, personId: null })).resolves.toEqual([expect.objectContaining({ split: 'SHARED', personId: null })]);
            await expectAppError(service.create({ ...base, cardId: inactiveCard.id }), {
                code: 'CREDIT_CARD_INACTIVE', statusCode: 409, reason: 'credit_card_inactive'
            });
            await expectAppError(service.create({ ...base, categoryId: antiga.id }), {
                code: 'CARD_EXPENSE_INACTIVE_CATEGORY', statusCode: 409, reason: 'category_inactive'
            });
        });
    });

    describe('move (corrigir a fatura da compra)', () => {
        const DECEMBER = new Date('2026-12-01T00:00:00.000Z');
        const KEY = 'P|2026-09-10|5|LOJA';

        /** Compra sincronizada em 5 vezes: 3/5 em novembro, 4/5 em dezembro e 5/5 em janeiro. */
        const seedSynced = () => [3, 4, 5].map(number => repository.seed({
            month: new Date(Date.UTC(2026, 7 + number, 1)),
            categoryId: mercado.id,
            nickname: 'Cadeira',
            personId: ana.id,
            origin: 'SYNC',
            importId: null,
            purchaseKey: KEY,
            installmentNumber: number,
            installmentTotal: 5,
            amountCents: 10000n
        }));
        const layout = () => [...repository.expenses.values()]
            .filter(row => row.purchaseKey === KEY)
            .sort((a, b) => a.month.getTime() - b.month.getTime())
            .map(row => [row.month.toISOString().slice(0, 7), row.installmentNumber]);

        it('3/5 de novembro vira 1/5 em dezembro: a compra inteira muda e a correção fica gravada', async () => {
            const [november] = seedSynced();

            const moved = await service.move(november.id, { month: '2026-12', installmentNumber: 1 });

            expect(layout()).toEqual([['2026-12', 1], ['2027-01', 2], ['2027-02', 3], ['2027-03', 4], ['2027-04', 5]]);
            expect(moved).toHaveLength(5);
            expect(moved.every(row => row.nickname === 'Cadeira' && row.categoryId === mercado.id && row.origin === 'SYNC')).toBe(true);
            expect(repository.corrections.get(`${card.id}|${KEY}`)).toEqual({ installmentNumber: 1, installmentTotal: 5, month: DECEMBER });
            expect(repository.get(moved[0].id).sourceMonth).toEqual(DECEMBER);
        });

        it('sincronizada: só os meses a partir da primeira fatura sincronizada recebem linhas', async () => {
            const [november] = seedSynced();

            await service.move(november.id, { month: '2026-10' });

            // 1/5 e 2/5 cairiam em agosto e setembro, antes de outubro.
            expect(layout()).toEqual([['2026-10', 3], ['2026-11', 4], ['2026-12', 5]]);
        });

        it('trocar o total de parcelas refaz a compra com o novo total', async () => {
            const [november] = seedSynced();

            await service.move(november.id, { month: '2026-11', installmentTotal: 6 });

            expect(layout()).toEqual([['2026-10', 2], ['2026-11', 3], ['2026-12', 4], ['2027-01', 5], ['2027-02', 6]]);
            expect(repository.corrections.get(`${card.id}|${KEY}`)).toMatchObject({ installmentNumber: 3, installmentTotal: 6 });
        });

        it('compra à vista sincronizada muda só de mês (o número de parcela é ignorado)', async () => {
            const single = repository.seed({ month: NOVEMBER, categoryId: outros.id, origin: 'SYNC', importId: null, purchaseKey: 'S|2026-10-23|1099|POSTO' });

            const moved = await service.move(single.id, { month: '2026-12', installmentNumber: 2 });

            expect(moved).toEqual([expect.objectContaining({ month: '2026-12', installment: null })]);
            expect(repository.corrections.get(`${card.id}|S|2026-10-23|1099|POSTO`)).toEqual({ installmentNumber: 1, installmentTotal: null, month: DECEMBER });
        });

        it('lançada à mão: muda sem gravar correção, a partir da primeira parcela que a compra tinha', async () => {
            const created = await service.create({
                cardId: card.id, month: '2026-12', date: '2026-10-03', description: 'Loja', amount: '50.00', installment: { number: 3, total: 5 }, split: 'SHARED'
            });
            const key = repository.get(created[0].id).purchaseKey;

            await service.move(created[0].id, { month: '2027-01' });
            const later = [...repository.expenses.values()].filter(row => row.purchaseKey === key).map(row => [row.month.toISOString().slice(0, 7), row.installmentNumber]);

            await service.move([...repository.expenses.values()].find(row => row.purchaseKey === key && row.installmentNumber === 3)?.id as string, {
                month: '2027-01', installmentNumber: 2
            });
            const renumbered = [...repository.expenses.values()].filter(row => row.purchaseKey === key).map(row => row.installmentNumber).sort();

            expect(later.sort()).toEqual([['2027-01', 3], ['2027-02', 4], ['2027-03', 5]]);
            expect(renumbered).toEqual([2, 3, 4, 5]);
            expect(repository.corrections.size).toBe(0);
        });

        it('compra de upload não muda (409); parcela maior que o total é 422; id inexistente é 404', async () => {
            const uploaded = repository.seed({ month: NOVEMBER, categoryId: outros.id });
            const [november] = seedSynced();

            await expectAppError(service.move(uploaded.id, { month: '2026-12' }), {
                code: 'CARD_EXPENSE_MOVE_NOT_ALLOWED', statusCode: 409, reason: 'card_expense_from_upload'
            });
            await expectAppError(service.move(november.id, { month: '2026-12', installmentNumber: 6 }), {
                code: 'CARD_EXPENSE_INSTALLMENT_INVALID', statusCode: 422, reason: 'installment_6_of_5'
            });
            await expectAppError(service.move(november.id, { month: '2026-12', installmentTotal: 2 }), {
                code: 'CARD_EXPENSE_INSTALLMENT_INVALID', statusCode: 422, reason: 'installment_3_of_2'
            });
            await expectAppError(service.move(MISSING_ID, { month: '2026-12' }), {
                code: 'CARD_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'card_expense_id_not_found'
            });
        });

        it('cartão sem primeira fatura sincronizada: a compra sincronizada recebe todas as parcelas', async () => {
            cards.cards.set(card.id, { ...card, syncFromMonth: null });
            const [november] = seedSynced();

            await service.move(november.id, { month: '2026-11' });

            expect(layout().map(([month]) => month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
        });
    });
});
