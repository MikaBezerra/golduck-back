import type { AnnualSummaryResponse, SummaryResponse, SummaryStatementResponse } from '../dto/summary.dto.js';

import { Role } from '../../../generated/prisma/enums.js';
import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { SummaryRepository } from '../repository/summary.repository.js';
import { SummaryModule } from '../summary.module.js';
import { InMemorySummaryRepository } from './in-memory-summary.repository.js';

/*
 * Rotas /summary por HTTP: login, validação das queries (Joi) e o envelope { data } / { error }.
 * As contas ficam no summary.service.spec e no summary.calculator.spec.
 */
describe('rotas /summary', () => {
    let repository: InMemorySummaryRepository;
    let api: HttpTestApp;

    const start = async (role?: Role): Promise<void> => {
        api = await HttpTestApp.create({
            imports: [SummaryModule],
            overrides: [{ provide: SummaryRepository, useValue: repository }],
            role
        });
    };

    beforeEach(() => {
        repository = new InMemorySummaryRepository();
        const ana = repository.seedPerson({ name: 'Ana' });
        const mercado = repository.seedCategory({ name: 'Mercado' });

        repository.incomes.set('2026-11', 500_000n);
        repository.manualExpenses.push({ month: '2026-11', categoryId: mercado.id, personId: ana.id, amountCents: 12_345n });
        repository.cardExpenses.push(
            { month: '2026-11', categoryId: mercado.id, personId: null, amountCents: 1_000n },
            { month: '2026-11', categoryId: mercado.id, personId: null, amountCents: 99_999n, excluded: true }
        );
    });

    afterEach(async () => {
        await api.close();
    });

    it('exige login nas rotas (401 AUTH_UNAUTHENTICATED)', async () => {
        await start();

        const monthly = await api.get('/summary', { auth: false, query: { month: '2026-11' } });
        const annual = await api.get('/summary/annual', { auth: false, query: { year: 2026 } });
        const statement = await api.get('/summary/statement', { auth: false, query: { month: '2026-11' } });

        for (const response of [monthly, annual, statement]) {
            expect(response.status).toBe(401);
            expect(errorOf(response).code).toBe('AUTH_UNAUTHENTICATED');
        }
    });

    it('GET /summary?month devolve o resumo do mês no envelope { data }, sem as despesas do cartão excluídas', async () => {
        await start();

        const response = await api.get('/summary', { query: { month: '2026-11' } });

        expect(response.status).toBe(200);
        expect(dataOf<SummaryResponse>(response)).toMatchObject({
            month: '2026-11',
            income: '5000.00',
            reserve: null,
            expensesTotal: '133.45',
            expensesCount: 2,
            balance: '4866.55',
            bySource: { manual: { amount: '123.45', count: 1 }, card: { amount: '10.00', count: 1 } },
            netByPerson: [{ name: 'Ana', share: '4990.00', individual: '123.45', net: '4866.55' }]
        });
    });

    it('GET /summary valida o mês: obrigatório, formato AAAA-MM e sem filtros extras (400)', async () => {
        await start();

        const missing = await api.get('/summary');
        const wrongFormat = await api.get('/summary', { query: { month: '2026-13' } });
        const extra = await api.get('/summary', { query: { month: '2026-11', personId: 'x' } });

        for (const response of [missing, wrongFormat, extra]) {
            expect(response.status).toBe(400);
            expect(errorOf(response)).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Os dados enviados são inválidos' });
        }

        expect(errorOf(missing).details).toEqual([{ field: 'month', code: 'any.required', message: 'month é obrigatório' }]);
        expect(errorOf(wrongFormat).details).toEqual([
            { field: 'month', code: 'string.pattern.base', message: 'O mês deve estar no formato AAAA-MM' }
        ]);
        expect(errorOf(extra).details).toEqual([{ field: 'personId', code: 'object.unknown', message: 'personId não é permitido' }]);
    });

    it('GET /summary/statement?month devolve a tabela do mês pronta, com a quebra e a reserva', async () => {
        await start();

        const response = await api.get('/summary/statement', { query: { month: '2026-11' } });
        const statement = dataOf<SummaryStatementResponse>(response);

        expect(response.status).toBe(200);
        expect(statement).toMatchObject({
            month: '2026-11',
            columns: [{ name: 'Ana', initial: 'A', inactive: false }],
            breakdown: [{ name: 'Ana', beforeReserve: '4990.00', individual: '123.45', reserve: '0.00', net: '4866.55' }],
            reserve: { month: null, accumulated: '0.00' },
            hasPeople: true,
            incomeMissing: false
        });
        expect(statement.sections.map(section => section.id)).toEqual(['income', 'shared', 'individual', 'result']);
    });

    it('GET /summary/statement valida o mês como GET /summary (400)', async () => {
        await start();

        const missing = await api.get('/summary/statement');
        const wrongFormat = await api.get('/summary/statement', { query: { month: '2026-1' } });

        for (const response of [missing, wrongFormat]) {
            expect(response.status).toBe(400);
            expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        }
    });

    it('GET /summary/annual?year devolve o ano (número) com os 12 meses', async () => {
        await start();

        const response = await api.get('/summary/annual', { query: { year: 2026 } });
        const annual = dataOf<AnnualSummaryResponse>(response);

        expect(response.status).toBe(200);
        expect(annual).toMatchObject({ year: 2026, income: '5000.00', expensesTotal: '133.45', balance: '4866.55' });
        expect(annual.months).toHaveLength(12);
        expect(annual.months[10]).toEqual({
            month: '2026-11', income: '5000.00', reserve: null, expensesTotal: '133.45', expensesCount: 2, balance: '4866.55', pendingCount: 0
        });
    });

    it('GET /summary/annual valida o ano: de 2000 a 2100, inteiro, obrigatório e sem campos extras (400)', async () => {
        await start();

        const first = await api.get('/summary/annual', { query: { year: 2000 } });
        const last = await api.get('/summary/annual', { query: { year: 2100 } });
        const before = await api.get('/summary/annual', { query: { year: 1999 } });
        const after = await api.get('/summary/annual', { query: { year: 2101 } });
        const decimal = await api.get('/summary/annual', { query: { year: '2026.5' } });
        const missing = await api.get('/summary/annual');
        const extra = await api.get('/summary/annual', { query: { year: 2026, month: '2026-01' } });

        expect(first.status).toBe(200);
        expect(dataOf<AnnualSummaryResponse>(first).year).toBe(2000);
        expect(last.status).toBe(200);

        for (const response of [before, after, decimal, missing, extra]) {
            expect(response.status).toBe(400);
            expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        }

        expect(errorOf(before).details).toEqual([{ field: 'year', code: 'number.min', message: 'year deve ser maior ou igual a 2000' }]);
        expect(errorOf(after).details).toEqual([{ field: 'year', code: 'number.max', message: 'year deve ser menor ou igual a 2100' }]);
        expect(errorOf(extra).details).toEqual([{ field: 'month', code: 'object.unknown', message: 'month não é permitido' }]);
    });

    it('ADMIN também acessa o resumo', async () => {
        await start(Role.ADMIN);

        const response = await api.get('/summary', { query: { month: '2026-11' } });

        expect(response.status).toBe(200);
    });
});
