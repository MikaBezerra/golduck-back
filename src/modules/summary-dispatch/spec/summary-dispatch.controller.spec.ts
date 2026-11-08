import type { Person } from '../../../generated/prisma/client.js';
import type {
    SummaryDispatchPreviewResponse,
    SummaryDispatchResponse,
    SummaryEmailPreviewResponse
} from '../dto/summary-dispatch.dto.js';

import { Role } from '../../../generated/prisma/enums.js';
import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { SummaryRepository } from '../../summary/repository/summary.repository.js';
import { InMemorySummaryRepository } from '../../summary/spec/in-memory-summary.repository.js';
import { SummaryMailer } from '../mail/summary-mailer.js';
import { DisabledSummaryMailer } from '../mail/summary-mailer.provider.js';
import { SummaryDispatchRepository } from '../repository/summary-dispatch.repository.js';
import { SummaryDispatchModule } from '../summary-dispatch.module.js';
import { FakeSummaryMailer, InMemorySummaryDispatchRepository } from './in-memory-summary-dispatch.repository.js';

const KEY = '0b7c5a52-3d4e-4f6a-8b9c-0d1e2f3a4b5c';

/*
 * Rotas /summary/dispatches por HTTP: só ADMIN, header Idempotency-Key, validação (Joi), envelope
 * { data } / { error } e o 503 com o e-mail desligado. As regras ficam no summary-dispatch.service.spec.
 */
describe('rotas /summary/dispatches', () => {
    let summary: InMemorySummaryRepository;
    let mailer: SummaryMailer;
    let api: HttpTestApp;
    let ana: Person;

    const start = async (role: Role = Role.ADMIN): Promise<void> => {
        api = await HttpTestApp.create({
            imports: [SummaryDispatchModule],
            overrides: [
                { provide: SummaryRepository, useValue: summary },
                { provide: SummaryDispatchRepository, useValue: new InMemorySummaryDispatchRepository(summary) },
                { provide: SummaryMailer, useValue: mailer }
            ],
            role
        });
    };
    /** key null = sem o header. */
    const send = async (body: unknown, key: string | null = KEY) =>
        api.request('POST', '/summary/dispatches', { body, headers: key === null ? {} : { 'idempotency-key': key } });

    beforeEach(() => {
        summary = new InMemorySummaryRepository();
        mailer = new FakeSummaryMailer();
        ana = summary.seedPerson({ name: 'Ana', email: 'ana@exemplo.com' });
        summary.seedPerson({ name: 'Bruno' });
        summary.incomes.set('2026-11', 500_000n);
    });

    afterEach(async () => {
        await api.close();
    });

    it('exige login (401) e papel ADMIN (403)', async () => {
        await start(Role.USER);

        const anonymous = await api.get('/summary/dispatches/preview', { auth: false, query: { month: '2026-11' } });
        const user = await send({ month: '2026-11' });

        expect(anonymous.status).toBe(401);
        expect(user.status).toBe(403);
    });

    it('POST envia e responde 200 com o resultado de cada pessoa; a mesma chave devolve o mesmo envio', async () => {
        await start();

        const first = await send({ month: '2026-11' });
        const again = await send({ month: '2026-11' });
        const result = dataOf<SummaryDispatchResponse>(first);

        expect(first.status).toBe(200);
        expect(result).toMatchObject({
            month: '2026-11',
            status: 'DONE',
            counts: { sent: 1, skipped: 1, failed: 0 },
            items: [
                { name: 'Ana', status: 'SENT', recipient: 'an•••@exemplo.com' },
                { name: 'Bruno', status: 'SKIPPED_NO_EMAIL', message: 'Bruno não tem e-mail cadastrado.' }
            ]
        });
        expect(dataOf<SummaryDispatchResponse>(again).id).toBe(result.id);
        expect((mailer as FakeSummaryMailer).sent).toHaveLength(1);
    });

    it('POST exige o header Idempotency-Key em formato UUID (400)', async () => {
        await start();

        const missing = await send({ month: '2026-11' }, null);
        const invalid = await send({ month: '2026-11' }, 'clique-1');

        expect(missing.status).toBe(400);
        expect(errorOf(missing)).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field: '$', message: 'O header Idempotency-Key é obrigatório' }] });
        expect(invalid.status).toBe(400);
        expect(errorOf(invalid).details).toEqual([{ field: '$', code: 'string.guid', message: 'O header Idempotency-Key deve ser um UUID' }]);
    });

    it('POST valida o corpo: mês AAAA-MM, personIds UUIDs sem repetir e sem campos extras (400)', async () => {
        await start();

        const responses = await Promise.all([
            send({}),
            send({ month: '2026-13' }),
            send({ month: '2026-11', personIds: ['x'] }),
            send({ month: '2026-11', personIds: [ana.id, ana.id] }),
            send({ month: '2026-11', personIds: [] }),
            send({ month: '2026-11', canal: 'whatsapp' })
        ]);

        for (const response of responses) {
            expect(response.status).toBe(400);
            expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        }
    });

    it('POST com compra do cartão sem pessoa no mês: 409 SUMMARY_DISPATCH_PENDING_EXPENSES', async () => {
        summary.cardExpenses.push({ month: '2026-11', categoryId: 'casa', personId: null, amountCents: 1_000n, pending: true });
        await start();

        const response = await send({ month: '2026-11' });
        const preview = await api.get('/summary/dispatches/preview', { query: { month: '2026-11' } });

        expect(response.status).toBe(409);
        expect(errorOf(response)).toMatchObject({
            code: 'SUMMARY_DISPATCH_PENDING_EXPENSES',
            message: 'Há 1 compra do cartão sem pessoa definida neste mês. Escolha a pessoa (ou compartilhada) antes de enviar o resumo.'
        });
        expect(dataOf<SummaryDispatchPreviewResponse>(preview)).toMatchObject({ pending: { amount: '10.00', count: 1 }, lastDispatch: null });
    });

    it('POST com e-mail desligado: 503 MAIL_DISABLED', async () => {
        mailer = new DisabledSummaryMailer();
        await start();

        const response = await send({ month: '2026-11' });

        expect(response.status).toBe(503);
        expect(errorOf(response)).toMatchObject({ code: 'MAIL_DISABLED', message: 'O envio de e-mail está desligado neste ambiente.' });
    });

    it('GET /preview, GET /email e GET (histórico) do mês', async () => {
        await start();
        await send({ month: '2026-11' });

        const preview = await api.get('/summary/dispatches/preview', { query: { month: '2026-11' } });
        const email = await api.get('/summary/dispatches/email', { query: { month: '2026-11', personId: ana.id } });
        const history = await api.get('/summary/dispatches', { query: { month: '2026-11' } });

        expect(preview.status).toBe(200);
        expect(dataOf<SummaryDispatchPreviewResponse>(preview)).toMatchObject({
            enabled: true,
            recipients: [{ name: 'Ana', hasEmail: true }, { name: 'Bruno', hasEmail: false, recipient: null }],
            lastDispatch: { status: 'DONE' }
        });
        expect(dataOf<SummaryEmailPreviewResponse>(email)).toMatchObject({ personId: ana.id, recipient: 'an•••@exemplo.com' });
        expect(dataOf<SummaryDispatchResponse[]>(history)).toHaveLength(1);
    });

    it('GETs validam a query (400)', async () => {
        await start();

        const responses = await Promise.all([
            api.get('/summary/dispatches/preview'),
            api.get('/summary/dispatches', { query: { month: '2026-1' } }),
            api.get('/summary/dispatches/email', { query: { month: '2026-11' } }),
            api.get('/summary/dispatches/email', { query: { month: '2026-11', personId: 'ana' } })
        ]);

        for (const response of responses) {
            expect(response.status).toBe(400);
            expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        }
    });
});
