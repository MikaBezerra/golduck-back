import type { TestResponse } from '../../../testing/http-test-app.js';

import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { ReserveRepository } from '../repository/reserve.repository.js';
import { ReservesModule } from '../reserves.module.js';
import { InMemoryReserveRepository } from './in-memory-reserve.repository.js';

const AMOUNT_MESSAGE = 'O valor deve estar em reais, por exemplo 10000.00';
const MONTH_MESSAGE = 'O mês deve estar no formato AAAA-MM';

type ReserveBody = { month: string; amount: string };

/*
 * Rotas /reserves por HTTP: autenticação, validação (Joi), envelope { data } / { error } e
 * códigos de status. As regras finas ficam no reserve.service.spec.
 */
describe('rotas /reserves', () => {
    let repository: InMemoryReserveRepository;
    let api: HttpTestApp;

    beforeEach(async () => {
        repository = new InMemoryReserveRepository();
        api = await HttpTestApp.create({
            imports: [ReservesModule],
            overrides: [{ provide: ReserveRepository, useValue: repository }]
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

    const months = (response: TestResponse): string[] => dataOf<ReserveBody[]>(response).map(reserve => reserve.month);

    it('exige login (401 AUTH_UNAUTHENTICATED sem token ou com token inválido)', async () => {
        const withoutToken = await api.get('/reserves', { auth: false });
        const invalidToken = await api.post('/reserves', { year: 2026, months: [1], amount: '10' }, { auth: 'nao-e-um-jwt' });

        expect(withoutToken.status).toBe(401);
        expect(errorOf(withoutToken).code).toBe('AUTH_UNAUTHENTICATED');
        expect(invalidToken.status).toBe(401);
        expect(repository.reserves.size).toBe(0);
    });

    describe('POST /reserves', () => {
        it('cria (201) a mesma reserva em vários meses e devolve a lista em ordem de mês', async () => {
            const response = await api.post('/reserves', { year: 2026, months: [12, 2, 8], amount: '4500.5' });

            expect(response.status).toBe(201);
            expect(dataOf<ReserveBody[]>(response).map(reserve => [reserve.month, reserve.amount])).toEqual([
                ['2026-02', '4500.50'],
                ['2026-08', '4500.50'],
                ['2026-12', '4500.50']
            ]);
            expect(repository.reserves.size).toBe(3);
        });

        it('ano: obrigatório, inteiro, de 1000 a 9999', async () => {
            expect((await api.post('/reserves', { year: 1000, months: [1], amount: '10' })).status).toBe(201);
            expect((await api.post('/reserves', { year: 9999, months: [1], amount: '10' })).status).toBe(201);

            expectInvalid(await api.post('/reserves', { months: [1], amount: '10' }), { field: 'year', code: 'any.required' });
            expectInvalid(await api.post('/reserves', { year: 999, months: [1], amount: '10' }), {
                field: 'year', code: 'number.min', message: 'year deve ser maior ou igual a 1000'
            });
            expectInvalid(await api.post('/reserves', { year: 10000, months: [1], amount: '10' }), {
                field: 'year', code: 'number.max', message: 'year deve ser menor ou igual a 9999'
            });
            expectInvalid(await api.post('/reserves', { year: 2026.5, months: [1], amount: '10' }), { field: 'year', code: 'number.integer' });
            expectInvalid(await api.post('/reserves', { year: 'dois mil', months: [1], amount: '10' }), { field: 'year', code: 'number.base' });
            expect(repository.reserves.size).toBe(2);
        });

        it('meses: lista obrigatória de 1 a 12 meses distintos, cada um de 1 a 12', async () => {
            const allYear = await api.post('/reserves', { year: 2026, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], amount: '10' });

            expect(allYear.status).toBe(201);
            expect(months(allYear)).toHaveLength(12);

            expectInvalid(await api.post('/reserves', { year: 2027, amount: '10' }), { field: 'months', code: 'any.required' });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [], amount: '10' }), {
                field: 'months', code: 'array.min', message: 'months deve conter pelo menos 1 itens'
            });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [0], amount: '10' }), { field: 'months[0]', code: 'number.min' });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [1, 13], amount: '10' }), { field: 'months[1]', code: 'number.max' });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [1.5], amount: '10' }), { field: 'months[0]', code: 'number.integer' });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [3, 3], amount: '10' }), { field: 'months[1]', code: 'array.unique' });
            expectInvalid(await api.post('/reserves', { year: 2027, months: 3, amount: '10' }), { field: 'months', code: 'array.base' });

            const thirteen = await api.post('/reserves', { year: 2027, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1], amount: '10' });

            expect(thirteen.status).toBe(400);
            expect(errorOf(thirteen).details).toContainEqual(expect.objectContaining({ field: 'months', code: 'array.max' }));
            expect(repository.reserves.size).toBe(12);
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
                const response = await api.post('/reserves', { year: 2026, months: [index + 1], amount });

                expect(response.status).toBe(201);
                expect(dataOf<ReserveBody[]>(response)[0].amount).toBe(expected);
            }

            for (const amount of ['01.00', '10.123', '10.', '.50', '-10.00', '10,50', '1.000,00', 'abc10.00', '10.00abc', '1e3', ' 10.00']) {
                expectInvalid(await api.post('/reserves', { year: 2027, months: [1], amount }), {
                    field: 'amount', code: 'string.pattern.base', message: AMOUNT_MESSAGE
                });
            }

            expectInvalid(await api.post('/reserves', { year: 2027, months: [1], amount: '1'.repeat(21) }), {
                field: 'amount', code: 'string.max', message: 'amount deve ter no máximo 20 caracteres'
            });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [1], amount: 10 }), { field: 'amount', code: 'string.base' });
            expectInvalid(await api.post('/reserves', { year: 2027, months: [1] }), { field: 'amount', code: 'any.required' });
            expect(repository.reserves.size).toBe(accepted.length);
        });

        it('valor zero ou acima do limite em centavos passa no formato, mas é recusado pela regra (400 RESERVE_INVALID_AMOUNT)', async () => {
            for (const amount of ['0', '0.00', '92233720368547758.08']) {
                const response = await api.post('/reserves', { year: 2026, months: [1], amount });

                expect(response.status).toBe(400);
                expect(errorOf(response)).toMatchObject({
                    code: 'RESERVE_INVALID_AMOUNT',
                    message: 'O valor da reserva deve ser maior que zero e caber em centavos'
                });
            }

            expect(repository.reserves.size).toBe(0);
        });

        it('recusa campos extras (400)', async () => {
            expectInvalid(await api.post('/reserves', { year: 2026, months: [1], amount: '10', note: 'poupança' }), {
                field: 'note', code: 'object.unknown'
            });
        });

        it('mês que já tem reserva: 409 RESERVE_MONTH_CONFLICT e nada é gravado', async () => {
            repository.seed('2026-08', 100000n);

            const response = await api.post('/reserves', { year: 2026, months: [7, 8], amount: '10' });

            expect(response.status).toBe(409);
            expect(errorOf(response)).toMatchObject({
                code: 'RESERVE_MONTH_CONFLICT',
                message: 'Já existe reserva para um dos meses escolhidos'
            });
            expect(repository.reserves.size).toBe(1);
        });
    });

    describe('GET /reserves', () => {
        beforeEach(() => {
            repository.seed('2027-01', 300n);
            repository.seed('2026-12', 200n);
            repository.seed('2025-12', 50n);
            repository.seed('2026-01', 100n);
        });

        it('lista todas em ordem de mês; year filtra o ano', async () => {
            const all = await api.get('/reserves');
            const year = await api.get('/reserves', { query: { year: 2026 } });

            expect(all.status).toBe(200);
            expect(months(all)).toEqual(['2025-12', '2026-01', '2026-12', '2027-01']);
            expect(dataOf<ReserveBody[]>(year)).toEqual([
                expect.objectContaining({ month: '2026-01', amount: '1.00' }),
                expect.objectContaining({ month: '2026-12', amount: '2.00' })
            ]);
        });

        it('recusa ano inválido e filtros desconhecidos (400)', async () => {
            expectInvalid(await api.get('/reserves', { query: { year: 'abc' } }), { field: 'year', code: 'number.base' });
            expectInvalid(await api.get('/reserves', { query: { year: 999 } }), { field: 'year', code: 'number.min' });
            expectInvalid(await api.get('/reserves', { query: { month: '2026-01' } }), { field: 'month', code: 'object.unknown' });
        });
    });

    describe('GET /reserves/totals', () => {
        it('sem reservas: total "0.00" e nenhum ano (a rota não é confundida com um mês)', async () => {
            const response = await api.get('/reserves/totals');

            expect(response.status).toBe(200);
            expect(dataOf(response)).toEqual({ total: '0.00', count: 0, byYear: [] });
        });

        it('soma histórica e por ano, em ordem crescente', async () => {
            repository.seed('2026-03', 150050n);
            repository.seed('2025-11', 100000n);
            repository.seed('2026-01', 49950n);

            const response = await api.get('/reserves/totals');

            expect(response.status).toBe(200);
            expect(dataOf(response)).toEqual({
                total: '3000.00',
                count: 3,
                byYear: [
                    { year: 2025, amount: '1000.00', count: 1 },
                    { year: 2026, amount: '2000.00', count: 2 }
                ]
            });
        });

        it('exige login', async () => {
            const response = await api.get('/reserves/totals', { auth: false });

            expect(response.status).toBe(401);
            expect(errorOf(response).code).toBe('AUTH_UNAUTHENTICATED');
        });
    });

    describe('GET /reserves/:month', () => {
        it('devolve a reserva do mês', async () => {
            const january = repository.seed('2026-01', 100n);
            repository.seed('2026-12', 123456n);

            const first = await api.get('/reserves/2026-01');
            const last = await api.get('/reserves/2026-12');

            expect(first.status).toBe(200);
            expect(dataOf(first)).toMatchObject({ id: january.id, month: '2026-01', amount: '1.00' });
            expect(dataOf(last)).toMatchObject({ month: '2026-12', amount: '1234.56' });
        });

        it('mês fora do formato AAAA-MM dá 400; mês sem reserva dá 404 RESERVE_NOT_FOUND', async () => {
            for (const month of ['2026-8', '2026-13', '2026-00', '0999-01', '202-08', 'x2026-08', '2026-08x', '2026_08', 'agosto']) {
                expectInvalid(await api.get(`/reserves/${month}`), { field: '$', code: 'string.pattern.base', message: MONTH_MESSAGE });
            }

            const missing = await api.get('/reserves/2026-10');

            expect(missing.status).toBe(404);
            expect(errorOf(missing)).toMatchObject({ code: 'RESERVE_NOT_FOUND', message: 'Reserva do mês não encontrada' });
        });
    });

    describe('PATCH /reserves/:month', () => {
        it('altera o valor do mês', async () => {
            repository.seed('2026-08', 100000n);

            const response = await api.patch('/reserves/2026-08', { amount: '1500.05' });

            expect(response.status).toBe(200);
            expect(dataOf(response)).toMatchObject({ month: '2026-08', amount: '1500.05' });
        });

        it('valida o corpo e o mês (400); valor zero é RESERVE_INVALID_AMOUNT', async () => {
            repository.seed('2026-08', 100000n);

            expectInvalid(await api.patch('/reserves/2026-08', {}), { field: 'amount', code: 'any.required' });
            expectInvalid(await api.patch('/reserves/2026-08', { amount: '1,50' }), { field: 'amount', message: AMOUNT_MESSAGE });
            expectInvalid(await api.patch('/reserves/2026-08', { amount: '10', year: 2026 }), { field: 'year', code: 'object.unknown' });
            expectInvalid(await api.patch('/reserves/2026-8', { amount: '10' }), { field: '$', message: MONTH_MESSAGE });

            const zero = await api.patch('/reserves/2026-08', { amount: '0' });

            expect(zero.status).toBe(400);
            expect(errorOf(zero).code).toBe('RESERVE_INVALID_AMOUNT');
            expect(repository.reserves.get('2026-08-01T00:00:00.000Z')?.amountCents).toBe(100000n);
        });

        it('mês sem reserva: 404 RESERVE_NOT_FOUND', async () => {
            const response = await api.patch('/reserves/2026-08', { amount: '10' });

            expect(response.status).toBe(404);
            expect(errorOf(response)).toMatchObject({ code: 'RESERVE_NOT_FOUND', message: 'Reserva do mês não encontrada' });
        });
    });

    describe('DELETE /reserves/:month', () => {
        it('remove (204, sem corpo); de novo dá 404', async () => {
            repository.seed('2026-08', 100000n);

            const removed = await api.delete('/reserves/2026-08');
            const again = await api.delete('/reserves/2026-08');

            expect(removed.status).toBe(204);
            expect(removed.body).toBeUndefined();
            expect(repository.reserves.size).toBe(0);
            expect(again.status).toBe(404);
            expect(errorOf(again).code).toBe('RESERVE_NOT_FOUND');
        });

        it('mês fora do formato: 400', async () => {
            expectInvalid(await api.delete('/reserves/2026-13'), { field: '$', message: MONTH_MESSAGE });
        });
    });
});
