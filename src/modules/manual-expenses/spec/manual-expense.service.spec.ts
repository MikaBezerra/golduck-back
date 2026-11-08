import type { Person } from '../../../generated/prisma/client.js';
import type { AppError } from '../../common/errors/app-error.js';
import type { PersonRepository } from '../../people/repository/person.repository.js';
import type { ManualExpenseRepository } from '../repository/manual-expense.repository.js';
import { jest } from '@jest/globals';

import { Prisma } from '../../../generated/prisma/client.js';
import { PersonService } from '../../people/service/person.service.js';
import { ManualExpenseService } from '../service/manual-expense.service.js';
import { FakePersonRepository } from './fake-person.repository.js';
import { InMemoryManualExpenseRepository } from './in-memory-manual-expense.repository.js';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const SEPTEMBER = new Date('2026-09-01T00:00:00.000Z');
const OCTOBER = new Date('2026-10-01T00:00:00.000Z');
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const DECEMBER = new Date('2026-12-01T00:00:00.000Z');

const recordNotFound = (): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'teste' });

/**
 * Regras das despesas fora do cartão (compartilhadas ou de uma pessoa), com repositórios em memória
 * no lugar do banco. Pessoas passam pelo serviço de verdade. Despesas não têm categoria (só as compras do cartão).
 */
describe('ManualExpenseService', () => {
    let people: FakePersonRepository;
    let repository: InMemoryManualExpenseRepository;
    let service: ManualExpenseService;
    let ana: Person;

    beforeEach(() => {
        people = new FakePersonRepository();
        repository = new InMemoryManualExpenseRepository();
        service = new ManualExpenseService(
            repository as unknown as ManualExpenseRepository,
            new PersonService(people as unknown as PersonRepository)
        );
        ana = people.seed({ name: 'Ana' });
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    describe('create', () => {
        it('compartilhada: uma despesa SHARED, sem categoria, com o valor em centavos', async () => {
            const created = await service.create({ split: 'SHARED', month: '2026-10', title: 'Internet', amount: '99.9' });

            expect(created).toHaveLength(1);
            const row = repository.get(created[0].id);
            expect(row).toMatchObject({ month: OCTOBER, title: 'Internet', amountCents: 9990n, split: 'SHARED', personId: null });
            expect(created[0]).toEqual({
                id: row.id,
                month: '2026-10',
                title: 'Internet',
                amount: '99.90',
                split: 'SHARED',
                personId: null,
                paidAt: null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
            });
        });

        it('usa a pessoa escolhida (despesa individual)', async () => {
            const [created] = await service.create({
                split: 'PERSONAL', month: '2026-03', title: 'Feira', amount: '1234.56', personId: ana.id
            });

            expect(created).toMatchObject({ month: '2026-03', amount: '1234.56', split: 'PERSONAL', personId: ana.id });
            expect(repository.get(created.id)).toMatchObject({ month: new Date('2026-03-01T00:00:00.000Z'), amountCents: 123456n });
        });

        it('SHARED com personId null (o front reenviando a resposta) é compartilhada, sem consultar o cadastro de pessoas', async () => {
            const findPerson = jest.spyOn(people, 'findById');

            const [created] = await service.create({ split: 'SHARED', month: '2026-10', title: 'Luz', amount: '150', personId: null });

            expect(created).toMatchObject({ split: 'SHARED', personId: null });
            expect(created.amount).toBe('150.00');
            expect(findPerson).not.toHaveBeenCalled();
        });

        it('com replicateUntilYearEnd, cria uma despesa independente em cada mês até dezembro', async () => {
            const created = await service.create({
                split: 'PERSONAL', month: '2026-10', title: 'Academia', amount: '120.00', personId: ana.id, replicateUntilYearEnd: true
            });

            expect(created.map(expense => expense.month)).toEqual(['2026-10', '2026-11', '2026-12']);
            expect(new Set(created.map(expense => expense.id)).size).toBe(3);
            expect([...repository.expenses.values()].map(expense => expense.month)).toEqual([OCTOBER, NOVEMBER, DECEMBER]);

            for (const expense of created) {
                expect(expense).toMatchObject({ title: 'Academia', amount: '120.00', personId: ana.id });
            }
        });

        it('replicar a partir de janeiro cria o ano todo; a partir de dezembro, só dezembro', async () => {
            const fromJanuary = await service.create({ split: 'SHARED', month: '2027-01', title: 'Seguro', amount: '50', replicateUntilYearEnd: true });
            const fromDecember = await service.create({ split: 'SHARED', month: '2027-12', title: 'Seguro', amount: '50', replicateUntilYearEnd: true });

            expect(fromJanuary.map(expense => expense.month)).toEqual([
                '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
                '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12'
            ]);
            expect(fromDecember.map(expense => expense.month)).toEqual(['2027-12']);
        });

        it('sem replicar (ou com replicateUntilYearEnd false) cria só o mês pedido', async () => {
            const withFalse = await service.create({ split: 'SHARED', month: '2026-02', title: 'Presente', amount: '80', replicateUntilYearEnd: false });

            expect(withFalse.map(expense => expense.month)).toEqual(['2026-02']);
            expect(repository.expenses.size).toBe(1);
        });

        it('devolve em ordem de mês mesmo que o banco devolva fora de ordem', async () => {
            jest.spyOn(repository, 'createMany').mockImplementation(async entries =>
                Promise.resolve(entries.map(entry => repository.seed(entry)).reverse()));

            const created = await service.create({ split: 'SHARED', month: '2026-09', title: 'Curso', amount: '300', replicateUntilYearEnd: true });

            expect(created.map(expense => expense.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
        });

        it('recusa valor zero ou que não cabe em centavos (400), sem gravar nada', async () => {
            const createMany = jest.spyOn(repository, 'createMany');

            for (const amount of ['0', '0.00', '92233720368547758.08']) {
                await expectAppError(service.create({ split: 'SHARED', month: '2026-10', title: 'Nada', amount }), {
                    code: 'MANUAL_EXPENSE_INVALID_AMOUNT', statusCode: 400, reason: 'manual_expense_amount_invalid'
                });
            }

            expect(createMany).not.toHaveBeenCalled();
        });

        it('aceita o maior valor que cabe em centavos', async () => {
            const [created] = await service.create({ split: 'SHARED', month: '2026-10', title: 'Teto', amount: '92233720368547758.07' });

            expect(created.amount).toBe('92233720368547758.07');
        });

        it('recusa pessoa inativa (409) sem gravar', async () => {
            const bia = people.seed({ name: 'Bia', active: false });

            await expectAppError(service.create({ split: 'PERSONAL', month: '2026-10', title: 'X', amount: '10', personId: bia.id }), {
                code: 'MANUAL_EXPENSE_INACTIVE_PERSON', statusCode: 409, reason: 'person_inactive'
            });
            expect(repository.expenses.size).toBe(0);
        });

        it('pessoa inexistente: 404 PERSON_NOT_FOUND (vem do cadastro de pessoas)', async () => {
            await expectAppError(service.create({ split: 'PERSONAL', month: '2026-10', title: 'X', amount: '10', personId: MISSING_ID }), {
                code: 'PERSON_NOT_FOUND', statusCode: 404, reason: 'person_id_not_found'
            });
        });
    });

    describe('findAll', () => {
        it('lista só as despesas do mês pedido, por título', async () => {
            repository.seed({ month: OCTOBER, title: 'Luz', amountCents: 15075n });
            repository.seed({ month: SEPTEMBER, title: 'Aluguel' });
            repository.seed({ month: OCTOBER, title: 'Condomínio', personId: ana.id });
            repository.seed({ month: NOVEMBER, title: 'Internet' });

            const expenses = await service.findAll({ month: '2026-10' });

            expect(expenses.map(expense => expense.title)).toEqual(['Condomínio', 'Luz']);
            expect(expenses[0]).toMatchObject({ month: '2026-10', personId: ana.id, amount: '10.00' });
            expect(expenses[1]).toMatchObject({ month: '2026-10', personId: null, amount: '150.75' });
        });

        it('converte janeiro e dezembro sem escorregar de ano', async () => {
            repository.seed({ month: new Date('2027-01-01T00:00:00.000Z'), title: 'Janeiro' });
            repository.seed({ month: DECEMBER, title: 'Dezembro' });

            const january = await service.findAll({ month: '2027-01' });
            const december = await service.findAll({ month: '2026-12' });

            expect(january.map(expense => expense.title)).toEqual(['Janeiro']);
            expect(december.map(expense => expense.title)).toEqual(['Dezembro']);
        });

        it('mês sem despesas devolve lista vazia', async () => {
            await expect(service.findAll({ month: '2026-10' })).resolves.toEqual([]);
        });
    });

    describe('summarize', () => {
        it('total do mês, pago e a pagar (sem as despesas de outros meses)', async () => {
            repository.seed({ month: OCTOBER, title: 'Feira', amountCents: 30_000n, paidAt: new Date() });
            repository.seed({ month: OCTOBER, title: 'Açougue', amountCents: 12_050n });
            repository.seed({ month: OCTOBER, title: 'Velha', amountCents: 5_000n });
            repository.seed({ month: NOVEMBER, title: 'Outro mês', amountCents: 99_900n });

            await expect(service.summarize({ month: '2026-10' })).resolves.toEqual({
                month: '2026-10',
                total: '470.50',
                paid: '300.00',
                unpaid: '170.50',
                count: 3
            });
        });

        it('mês sem despesas: zeros', async () => {
            await expect(service.summarize({ month: '2026-09' })).resolves.toEqual({
                month: '2026-09', total: '0.00', paid: '0.00', unpaid: '0.00', count: 0
            });
        });
    });

    describe('findById', () => {
        it('devolve a despesa no formato da API', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Gás', personId: ana.id, amountCents: 5n });

            await expect(service.findById(expense.id)).resolves.toEqual({
                id: expense.id,
                month: '2026-10',
                title: 'Gás',
                amount: '0.05',
                split: 'PERSONAL',
                personId: ana.id,
                paidAt: null,
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
        it('só o título: valor e pessoa ficam como estavam (sem consultar o cadastro de pessoas)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net', personId: ana.id, amountCents: 9990n });
            const update = jest.spyOn(repository, 'updateManyByIds');
            const findPerson = jest.spyOn(people, 'findById');

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { title: 'Fibra' } });

            expect(updated).toMatchObject({ id: expense.id, title: 'Fibra', amount: '99.90', personId: ana.id, month: '2026-10' });
            expect(update).toHaveBeenCalledWith([expense.id], { title: 'Fibra', amountCents: undefined, personId: undefined });
            expect(findPerson).not.toHaveBeenCalled();
        });

        it('paid true marca como paga agora; paid false desmarca; sem paid, fica como estava', async () => {
            const now = new Date('2026-11-30T15:00:00.000Z');
            const first = repository.seed({ month: OCTOBER, title: 'Luz' });
            const second = repository.seed({ month: OCTOBER, title: 'Água' });
            jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] });

            try {
                const paid = await service.updateMany({ ids: [first.id, second.id], changes: { paid: true } });

                expect(paid.map(expense => expense.paidAt)).toEqual([now, now]);
                await service.updateMany({ ids: [first.id], changes: { title: 'Conta de luz' } });
                expect(repository.get(first.id).paidAt).toEqual(now);
                await expect(service.updateMany({ ids: [first.id], changes: { paid: false } })).resolves.toEqual([
                    expect.objectContaining({ title: 'Conta de luz', paidAt: null })
                ]);
                expect(repository.get(second.id).paidAt).toEqual(now);
            } finally {
                jest.useRealTimers();
            }
        });

        it('converte o novo valor para centavos', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net' });

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { amount: '1500' } });

            expect(updated.amount).toBe('1500.00');
            expect(repository.get(expense.id)).toMatchObject({ amountCents: 150000n, title: 'Net' });
        });

        it('troca a pessoa; split SHARED torna a despesa compartilhada e limpa a pessoa', async () => {
            const first = repository.seed({ month: OCTOBER, title: 'Cinema' });
            const second = repository.seed({ month: OCTOBER, title: 'Show', personId: ana.id });

            const [moved] = await service.updateMany({ ids: [first.id], changes: { split: 'PERSONAL', personId: ana.id } });
            const [shared] = await service.updateMany({ ids: [second.id], changes: { split: 'SHARED' } });

            expect(moved).toMatchObject({ split: 'PERSONAL', personId: ana.id });
            expect(shared).toMatchObject({ split: 'SHARED', personId: null });
            expect(repository.get(second.id)).toMatchObject({ split: 'SHARED', personId: null });
        });

        it('sem split, a pessoa fica como estava', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Show', personId: ana.id });

            const [updated] = await service.updateMany({ ids: [expense.id], changes: { title: 'Teatro' } });

            expect(updated).toMatchObject({ title: 'Teatro', split: 'PERSONAL', personId: ana.id });
        });

        it('altera todas as despesas pedidas de uma vez e devolve todas', async () => {
            const first = repository.seed({ month: OCTOBER, title: 'A' });
            const second = repository.seed({ month: NOVEMBER, title: 'B' });
            const untouched = repository.seed({ month: NOVEMBER, title: 'C' });

            const updated = await service.updateMany({ ids: [first.id, second.id], changes: { title: 'Z' } });

            expect(updated.map(expense => [expense.id, expense.month, expense.title])).toEqual([
                [first.id, '2026-10', 'Z'],
                [second.id, '2026-11', 'Z']
            ]);
            expect(repository.get(untouched.id).title).toBe('C');
        });

        it('recusa valor inválido (400) sem alterar nada', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net' });
            const update = jest.spyOn(repository, 'updateManyByIds');

            await expectAppError(service.updateMany({ ids: [expense.id], changes: { amount: '0.00' } }), {
                code: 'MANUAL_EXPENSE_INVALID_AMOUNT', statusCode: 400, reason: 'manual_expense_amount_invalid'
            });
            expect(update).not.toHaveBeenCalled();
        });

        it('recusa pessoa inativa (409) sem alterar nada', async () => {
            const bia = people.seed({ name: 'Bia', active: false });
            const expense = repository.seed({ month: OCTOBER, title: 'Net' });
            const update = jest.spyOn(repository, 'updateManyByIds');

            await expectAppError(service.updateMany({ ids: [expense.id], changes: { split: 'PERSONAL', personId: bia.id } }), {
                code: 'MANUAL_EXPENSE_INACTIVE_PERSON', statusCode: 409, reason: 'person_inactive'
            });
            expect(update).not.toHaveBeenCalled();
        });

        it('um id inexistente: 404 e nenhuma despesa muda (transação)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net' });

            await expectAppError(service.updateMany({ ids: [expense.id, MISSING_ID], changes: { title: 'Outra' } }), {
                code: 'MANUAL_EXPENSE_NOT_FOUND', statusCode: 404, reason: 'manual_expense_id_not_found'
            });
            expect(repository.get(expense.id).title).toBe('Net');
        });

        it('outros erros do banco passam como vieram (inclusive um P2025 que não é do Prisma)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'Net' });
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
            const first = repository.seed({ month: OCTOBER, title: 'A' });
            const second = repository.seed({ month: OCTOBER, title: 'B' });
            const kept = repository.seed({ month: OCTOBER, title: 'C' });

            await expect(service.deleteMany([first.id, second.id])).resolves.toBeUndefined();

            expect([...repository.expenses.keys()]).toEqual([kept.id]);
        });

        it('um id inexistente: 404 e nada é excluído (transação)', async () => {
            const expense = repository.seed({ month: OCTOBER, title: 'A' });

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
