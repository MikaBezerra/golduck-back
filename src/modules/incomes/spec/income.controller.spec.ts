import type { TestResponse } from '../../../testing/http-test-app.js';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { IncomesModule } from '../incomes.module.js';
import { IncomeRepository } from '../repository/income.repository.js';
import { InMemoryIncomeRepository } from './in-memory-income.repository.js';

const AMOUNT_MESSAGE = 'O valor deve estar em reais, por exemplo 10000.00';
const MONTH_MESSAGE = 'O mês deve estar no formato AAAA-MM';

type IncomeBody = { month: string; amount: string };

/*
 * Rotas /incomes por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no income.service.spec.
 */
describe('rotas /incomes', () => {
    let repository: InMemoryIncomeRepository;
    let api: HttpTestApp;

    beforeEach(async () => {
        repository = new InMemoryIncomeRepository();
        api = await HttpTestApp.create({
            imports: [IncomesModule],
            overrides: [{ provide: IncomeRepository, useValue: repository }]
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

    const months = (response: TestResponse): string[] => dataOf<IncomeBody[]>(response).map(income => income.month);

    it('exige login (401 AUTH_UNAUTHENTICATED sem token ou com token inválido)', async () => {
        const withoutToken = await api.get('/incomes', { auth: false });
        const invalidToken = await api.post('/incomes', { year: 2026, months: [1], amount: '10' }, { auth: 'nao-e-um-jwt' });

        expect(withoutToken.status).toBe(401);
        expect(errorOf(withoutToken).code).toBe('AUTH_UNAUTHENTICATED');
        expect(invalidToken.status).toBe(401);
        expect(repository.incomes.size).toBe(0);
    });

    describe('POST /incomes', () => {
        it('cria (201) a mesma entrada em vários meses e devolve a lista em ordem de mês', async () => {
            const response = await api.post('/incomes', { year: 2026, months: [12, 2, 8], amount: '4500.5' });

            expect(response.status).toBe(201);
            expect(dataOf<IncomeBody[]>(response).map(income => [income.month, income.amount])).toEqual([
                ['2026-02', '4500.50'],
                ['2026-08', '4500.50'],
                ['2026-12', '4500.50']
            ]);
            expect(repository.incomes.size).toBe(3);
        });

        it('ano: obrigatório, inteiro, de 1000 a 9999', async () => {
            expect((await api.post('/incomes', { year: 1000, months: [1], amount: '10' })).status).toBe(201);
            expect((await api.post('/incomes', { year: 9999, months: [1], amount: '10' })).status).toBe(201);

            expectInvalid(await api.post('/incomes', { months: [1], amount: '10' }), { field: 'year', code: 'any.required' });
            expectInvalid(await api.post('/incomes', { year: 999, months: [1], amount: '10' }), {
                field: 'year', code: 'number.min', message: 'year deve ser maior ou igual a 1000'
            });
            expectInvalid(await api.post('/incomes', { year: 10000, months: [1], amount: '10' }), {
                field: 'year', code: 'number.max', message: 'year deve ser menor ou igual a 9999'
            });
            expectInvalid(await api.post('/incomes', { year: 2026.5, months: [1], amount: '10' }), { field: 'year', code: 'number.integer' });
            expectInvalid(await api.post('/incomes', { year: 'dois mil', months: [1], amount: '10' }), { field: 'year', code: 'number.base' });
            expect(repository.incomes.size).toBe(2);
        });

        it('meses: lista obrigatória de 1 a 12 meses distintos, cada um de 1 a 12', async () => {
            const allYear = await api.post('/incomes', { year: 2026, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], amount: '10' });

            expect(allYear.status).toBe(201);
            expect(months(allYear)).toHaveLength(12);

            expectInvalid(await api.post('/incomes', { year: 2027, amount: '10' }), { field: 'months', code: 'any.required' });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [], amount: '10' }), {
                field: 'months', code: 'array.min', message: 'months deve conter pelo menos 1 itens'
            });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [0], amount: '10' }), { field: 'months[0]', code: 'number.min' });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [1, 13], amount: '10' }), { field: 'months[1]', code: 'number.max' });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [1.5], amount: '10' }), { field: 'months[0]', code: 'number.integer' });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [3, 3], amount: '10' }), { field: 'months[1]', code: 'array.unique' });
            expectInvalid(await api.post('/incomes', { year: 2027, months: 3, amount: '10' }), { field: 'months', code: 'array.base' });

            const thirteen = await api.post('/incomes', { year: 2027, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1], amount: '10' });

            expect(thirteen.status).toBe(400);
            expect(errorOf(thirteen).details).toContainEqual(expect.objectContaining({ field: 'months', code: 'array.max' }));
            expect(repository.incomes.size).toBe(12);
        });

        it('valor: texto em reais com até 2 casas, sem zero à esquerda, até 20 caracteres', async () => {
            const accepted: Array<[string, string]> = [
                ['3500', '3500.00'],
                ['0.5', '0.50'],
                ['1234.56', '1234.56'],
                ['10.5', '10.50'],
                ['92233720368547758.07', '92233720368547758.07']
            ];

            for (const [index, [amount, expected]] of accepted.entries()) {
                const response = await api.post('/incomes', { year: 2026, months: [index + 1], amount });

                expect(response.status).toBe(201);
                expect(dataOf<IncomeBody[]>(response)[0].amount).toBe(expected);
            }

            for (const amount of ['01.00', '10.123', '10.', '.50', '-10.00', '10,50', '1.000,00', 'abc10.00', '10.00abc', '1e3', ' 10.00']) {
                expectInvalid(await api.post('/incomes', { year: 2027, months: [1], amount }), {
                    field: 'amount', code: 'string.pattern.base', message: AMOUNT_MESSAGE
                });
            }

            expectInvalid(await api.post('/incomes', { year: 2027, months: [1], amount: '1'.repeat(21) }), {
                field: 'amount', code: 'string.max', message: 'amount deve ter no máximo 20 caracteres'
            });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [1], amount: 10 }), { field: 'amount', code: 'string.base' });
            expectInvalid(await api.post('/incomes', { year: 2027, months: [1] }), { field: 'amount', code: 'any.required' });
            expect(repository.incomes.size).toBe(accepted.length);
        });

        it('valor zero ou acima do limite em centavos passa no formato, mas é recusado pela regra (400 INCOME_INVALID_AMOUNT)', async () => {
            for (const amount of ['0', '0.00', '92233720368547758.08']) {
                const response = await api.post('/incomes', { year: 2026, months: [1], amount });

                expect(response.status).toBe(400);
                expect(errorOf(response)).toMatchObject({
                    code: 'INCOME_INVALID_AMOUNT',
                    message: 'O valor da entrada deve ser maior que zero e caber em centavos'
                });
            }

            expect(repository.incomes.size).toBe(0);
        });

        it('recusa campos extras (400)', async () => {
            expectInvalid(await api.post('/incomes', { year: 2026, months: [1], amount: '10', note: 'salário' }), {
                field: 'note', code: 'object.unknown'
            });
        });

        it('mês que já tem entrada: 409 INCOME_MONTH_CONFLICT e nada é gravado', async () => {
            repository.seed('2026-08', 100000n);

            const response = await api.post('/incomes', { year: 2026, months: [7, 8], amount: '10' });

            expect(response.status).toBe(409);
            expect(errorOf(response)).toMatchObject({
                code: 'INCOME_MONTH_CONFLICT',
                message: 'Já existe entrada para um dos meses escolhidos'
            });
            expect(repository.incomes.size).toBe(1);
        });
    });

    describe('GET /incomes', () => {
        beforeEach(() => {
            repository.seed('2027-01', 300n);
            repository.seed('2026-12', 200n);
            repository.seed('2025-12', 50n);
            repository.seed('2026-01', 100n);
        });

        it('lista todas em ordem de mês; year filtra o ano', async () => {
            const all = await api.get('/incomes');
            const year = await api.get('/incomes', { query: { year: 2026 } });

            expect(all.status).toBe(200);
            expect(months(all)).toEqual(['2025-12', '2026-01', '2026-12', '2027-01']);
            expect(dataOf<IncomeBody[]>(year)).toEqual([
                expect.objectContaining({ month: '2026-01', amount: '1.00' }),
                expect.objectContaining({ month: '2026-12', amount: '2.00' })
            ]);
        });

        it('recusa ano inválido e filtros desconhecidos (400)', async () => {
            expectInvalid(await api.get('/incomes', { query: { year: 'abc' } }), { field: 'year', code: 'number.base' });
            expectInvalid(await api.get('/incomes', { query: { year: 999 } }), { field: 'year', code: 'number.min' });
            expectInvalid(await api.get('/incomes', { query: { month: '2026-01' } }), { field: 'month', code: 'object.unknown' });
        });
    });

    describe('GET /incomes/:month', () => {
        it('devolve a entrada do mês', async () => {
            const january = repository.seed('2026-01', 100n);
            repository.seed('2026-12', 123456n);

            const first = await api.get('/incomes/2026-01');
            const last = await api.get('/incomes/2026-12');

            expect(first.status).toBe(200);
            expect(dataOf(first)).toMatchObject({ id: january.id, month: '2026-01', amount: '1.00' });
            expect(dataOf(last)).toMatchObject({ month: '2026-12', amount: '1234.56' });
        });

        it('mês fora do formato AAAA-MM dá 400; mês sem entrada dá 404 INCOME_NOT_FOUND', async () => {
            for (const month of ['2026-8', '2026-13', '2026-00', '0999-01', '202-08', 'x2026-08', '2026-08x', '2026_08', 'agosto']) {
                expectInvalid(await api.get(`/incomes/${month}`), { field: '$', code: 'string.pattern.base', message: MONTH_MESSAGE });
            }

            const missing = await api.get('/incomes/2026-10');

            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'INCOME_NOT_FOUND', message: 'Entrada do mês não encontrada' });
        });
    });

    describe('PATCH /incomes/:month', () => {
        it('altera o valor do mês', async () => {
            repository.seed('2026-08', 100000n);

            const response = await api.patch('/incomes/2026-08', { amount: '1500.05' });

            expect(response.status).toBe(200);
            expect(dataOf(response)).toMatchObject({ month: '2026-08', amount: '1500.05' });
        });

        it('valida o corpo e o mês (400); valor zero é INCOME_INVALID_AMOUNT', async () => {
            repository.seed('2026-08', 100000n);

            expectInvalid(await api.patch('/incomes/2026-08', {}), { field: 'amount', code: 'any.required' });
            expectInvalid(await api.patch('/incomes/2026-08', { amount: '1,50' }), { field: 'amount', message: AMOUNT_MESSAGE });
            expectInvalid(await api.patch('/incomes/2026-08', { amount: '10', year: 2026 }), { field: 'year', code: 'object.unknown' });
            expectInvalid(await api.patch('/incomes/2026-8', { amount: '10' }), { field: '$', message: MONTH_MESSAGE });

            const zero = await api.patch('/incomes/2026-08', { amount: '0' });

            expect(zero.status).toBe(400);
            expect(errorOf(zero).code).toBe('INCOME_INVALID_AMOUNT');
            expect(repository.incomes.get('2026-08-01T00:00:00.000Z')?.amountCents).toBe(100000n);
        });

        it('mês sem entrada: 404 INCOME_NOT_FOUND', async () => {
            const response = await api.patch('/incomes/2026-08', { amount: '10' });

            expect(response.status).toBe(404);
            expect(errorOf(response)).toMatchObject({ code: 'INCOME_NOT_FOUND', message: 'Entrada do mês não encontrada' });
        });
    });

    describe('DELETE /incomes/:month', () => {
        it('remove (204, sem corpo); de novo dá 404', async () => {
            repository.seed('2026-08', 100000n);

            const removed = await api.delete('/incomes/2026-08');
            const again = await api.delete('/incomes/2026-08');

            expect(removed.status).toBe(204);
            expect(removed.body).toBeUndefined();
            expect(repository.incomes.size).toBe(0);
            expect(again.status).toBe(404);
            expect(errorOf(again).code).toBe('INCOME_NOT_FOUND');
        });

        it('mês fora do formato: 400', async () => {
            expectInvalid(await api.delete('/incomes/2026-13'), { field: '$', message: MONTH_MESSAGE });
        });
    });
});
