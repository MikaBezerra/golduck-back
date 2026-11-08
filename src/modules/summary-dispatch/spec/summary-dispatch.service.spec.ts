import type { Person } from '../../../generated/prisma/client.js';
import type { LoggerService } from '../../common/index.js';
import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';

import { SummaryRepository } from '../../summary/repository/summary.repository.js';
import { SummaryService } from '../../summary/service/summary.service.js';
import { InMemorySummaryRepository } from '../../summary/spec/in-memory-summary.repository.js';
import { MailSendError } from '../mail/summary-mailer.js';
import { SummaryDispatchRepository } from '../repository/summary-dispatch.repository.js';
import { STALE_DISPATCH_MS, SummaryDispatchService } from '../service/summary-dispatch.service.js';
import { FakeSummaryMailer, InMemorySummaryDispatchRepository } from './in-memory-summary-dispatch.repository.js';

const KEY = '0b7c5a52-3d4e-4f6a-8b9c-0d1e2f3a4b5c';
const OTHER_KEY = '1c8d6b63-4e5f-4a7b-9cad-1e2f3a4b5c6d';
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');

/*
 * Envio do resumo com os repositórios em memória e um mailer falso: cada pessoa isolada (sem e-mail
 * ou com falha não impede as outras), duplo clique pela Idempotency-Key, um envio por mês de cada vez
 * e a liberação de envios presos.
 */
describe('SummaryDispatchService', () => {
    let summary: InMemorySummaryRepository;
    let repository: InMemorySummaryDispatchRepository;
    let mailer: FakeSummaryMailer;
    let logger: { info: jest.Mock; warn: jest.Mock };
    let service: SummaryDispatchService;
    let ana: Person;
    let bruno: Person;
    let carla: Person;

    beforeEach(() => {
        summary = new InMemorySummaryRepository();
        repository = new InMemorySummaryDispatchRepository(summary);
        mailer = new FakeSummaryMailer();
        logger = { info: jest.fn(), warn: jest.fn() };
        service = new SummaryDispatchService(
            repository as unknown as SummaryDispatchRepository,
            new SummaryService(summary as unknown as SummaryRepository),
            mailer,
            logger as unknown as LoggerService
        );

        ana = summary.seedPerson({ name: 'Ana', email: 'ana@exemplo.com' });
        bruno = summary.seedPerson({ name: 'Bruno' });
        carla = summary.seedPerson({ name: 'Carla', email: 'carla@exemplo.com' });
        summary.seedPerson({ name: 'Davi', email: 'davi@exemplo.com', active: false });

        const casa = summary.seedCategory({ name: 'Casa' });

        summary.incomes.set('2026-11', 900_000n);
        summary.reserves.set('2026-10', 50_000n);
        summary.reserves.set('2026-11', 30_000n);
        summary.manualExpenses.push(
            { month: '2026-11', categoryId: casa.id, personId: null, amountCents: 300_000n },
            { month: '2026-11', categoryId: casa.id, personId: ana.id, amountCents: 12_345n }
        );
    });

    describe('dispatch', () => {
        it('envia para quem tem e-mail, pula quem não tem e responde o resultado de cada pessoa ativa', async () => {
            const result = await service.dispatch({ month: '2026-11' }, KEY);

            expect(result).toMatchObject({
                month: '2026-11',
                channel: 'EMAIL',
                status: 'DONE',
                counts: { sent: 2, skipped: 1, failed: 0 },
                items: [
                    { personId: ana.id, name: 'Ana', status: 'SENT', recipient: 'an•••@exemplo.com', errorCode: null, message: null },
                    { personId: bruno.id, name: 'Bruno', status: 'SKIPPED_NO_EMAIL', recipient: null, message: 'Bruno não tem e-mail cadastrado.' },
                    { personId: carla.id, name: 'Carla', status: 'SENT', recipient: 'ca•••@exemplo.com' }
                ]
            });
            expect(result.finishedAt).toBeInstanceOf(Date);
            expect(mailer.sent.map(message => message.to)).toEqual(['ana@exemplo.com', 'carla@exemplo.com']);
            expect(repository.dispatches[0]).toMatchObject({ status: 'DONE', runningMonth: null });
            expect(logger.info).toHaveBeenCalledWith('Resumo enviado por e-mail', expect.objectContaining({ month: '2026-11', sent: 2, skipped: 1 }));
        });

        it('o e-mail de cada pessoa traz o líquido dela em etapas e a reserva do mês e acumulada', async () => {
            await service.dispatch({ month: '2026-11' }, KEY);

            // (9000.00 − 3000.00) / 3 = 2000.00; reserva 300.00 = 100.00 para cada; Ana gastou 123.45
            const [toAna] = mailer.sent;

            expect(toAna.subject).toMatch(/^Golduck · Resumo de novembro\/2026/);
            expect(toAna.text).toContain('Líquido sem gastos individuais: R$ 2.000,00');
            expect(toAna.text).toContain('(−) Gastos individuais: R$ 123,45');
            expect(toAna.text).toContain('(−) Sua parte da reserva: R$ 100,00');
            expect(toAna.text).toContain('Líquido: R$ 1.776,55');
            expect(toAna.text).toContain('Guardado neste mês: R$ 300,00');
            expect(toAna.text).toContain('Reserva acumulada até novembro/2026: R$ 800,00');
            expect(toAna.html).toContain('Olá, Ana!');
        });

        it('falha no envio de uma pessoa vira item FAILED com mensagem amigável; as outras recebem', async () => {
            mailer.failures.set('ana@exemplo.com', new MailSendError('MAIL_RECIPIENT_REJECTED', 'EENVELOPE:550'));
            mailer.failures.set('carla@exemplo.com', new Error('bug inesperado'));

            const result = await service.dispatch({ month: '2026-11' }, KEY);

            expect(result.counts).toEqual({ sent: 0, skipped: 1, failed: 2 });
            expect(result.items).toMatchObject([
                {
                    name: 'Ana',
                    status: 'FAILED',
                    errorCode: 'MAIL_RECIPIENT_REJECTED',
                    message: 'O servidor de e-mail recusou o endereço de Ana. Confira o e-mail cadastrado.'
                },
                { name: 'Bruno', status: 'SKIPPED_NO_EMAIL' },
                { name: 'Carla', status: 'FAILED', errorCode: 'MAIL_SEND_FAILED', message: 'Não foi possível enviar o resumo para Carla. Tente de novo mais tarde.' }
            ]);
            expect(logger.warn).toHaveBeenCalledWith('Falha ao enviar o resumo por e-mail', expect.objectContaining({
                recipient: 'an•••@exemplo.com', code: 'MAIL_RECIPIENT_REJECTED', reason: 'EENVELOPE:550'
            }));
            expect(logger.warn).toHaveBeenCalledWith('Falha ao enviar o resumo por e-mail', expect.objectContaining({ code: 'MAIL_SEND_FAILED' }));
        });

        it('servidor que cai no meio do envio de uma pessoa: FAILED com MAIL_CONNECTION_FAILED', async () => {
            mailer.failures.set('carla@exemplo.com', new MailSendError('MAIL_CONNECTION_FAILED', 'ETIMEDOUT:-'));

            const result = await service.dispatch({ month: '2026-11' }, KEY);

            expect(result.items[2]).toMatchObject({
                status: 'FAILED',
                errorCode: 'MAIL_CONNECTION_FAILED',
                message: 'Não foi possível falar com o servidor de e-mail ao enviar para Carla. Tente de novo.'
            });
            expect(result.counts).toEqual({ sent: 1, skipped: 1, failed: 1 });
        });

        it('com personIds, envia só para elas (reenviar para quem falhou)', async () => {
            const result = await service.dispatch({ month: '2026-11', personIds: [carla.id] }, KEY);

            expect(result.items.map(item => item.name)).toEqual(['Carla']);
            expect(mailer.sent.map(message => message.to)).toEqual(['carla@exemplo.com']);
        });

        it('personIds com alguém fora da divisão do mês: 400, sem enviar nem gravar', async () => {
            const davi = [...summary.people.values()].find(person => person.name === 'Davi') as Person;

            await expect(service.dispatch({ month: '2026-11', personIds: [ana.id, davi.id] }, KEY))
                .rejects.toMatchObject({ code: 'SUMMARY_DISPATCH_UNKNOWN_PERSON', statusCode: 400 });
            expect(mailer.sent).toEqual([]);
            expect(repository.dispatches).toEqual([]);
        });

        it('mês com compra do cartão sem pessoa: 409 antes de falar com o servidor de e-mail, sem enviar nem gravar', async () => {
            const verify = jest.spyOn(mailer, 'verify');

            summary.cardExpenses.push({ month: '2026-11', categoryId: 'casa', personId: null, amountCents: 1_000n, pending: true });

            await expect(service.dispatch({ month: '2026-11' }, KEY)).rejects.toMatchObject({
                code: 'SUMMARY_DISPATCH_PENDING_EXPENSES',
                statusCode: 409,
                message: 'Há 1 compra do cartão sem pessoa definida neste mês. Escolha a pessoa (ou compartilhada) antes de enviar o resumo.',
                reason: 'summary_dispatch_pending_expenses'
            });

            summary.cardExpenses.push({ month: '2026-11', categoryId: 'casa', personId: null, amountCents: 500n, pending: true });

            await expect(service.dispatch({ month: '2026-11', personIds: [ana.id] }, KEY)).rejects.toMatchObject({
                message: 'Há 2 compras do cartão sem pessoa definida neste mês. Escolha a pessoa (ou compartilhada) antes de enviar o resumo.'
            });
            expect(verify).not.toHaveBeenCalled();
            expect(mailer.sent).toEqual([]);
            expect(repository.dispatches).toEqual([]);
        });

        it('compra pendente excluída da fatura ou de outro mês não bloqueia o envio', async () => {
            summary.cardExpenses.push(
                { month: '2026-11', categoryId: 'casa', personId: null, amountCents: 1_000n, pending: true, excluded: true },
                { month: '2026-12', categoryId: 'casa', personId: null, amountCents: 1_000n, pending: true }
            );

            await expect(service.dispatch({ month: '2026-11' }, KEY)).resolves.toMatchObject({ status: 'DONE' });
        });

        it('e-mail fora do ar: 503 antes de qualquer envio, sem gravar nada', async () => {
            mailer.verifyError = new Error('503 simulado');

            await expect(service.dispatch({ month: '2026-11' }, KEY)).rejects.toThrow('503 simulado');
            expect(repository.dispatches).toEqual([]);
        });

        describe('duplo clique e envios simultâneos', () => {
            it('a mesma Idempotency-Key devolve o mesmo resultado, sem enviar de novo', async () => {
                const first = await service.dispatch({ month: '2026-11' }, KEY);
                const second = await service.dispatch({ month: '2026-11' }, KEY);

                expect(second).toEqual(first);
                expect(mailer.sent).toHaveLength(2);
                expect(repository.dispatches).toHaveLength(1);
            });

            it('a mesma chave para outro mês: 409 SUMMARY_DISPATCH_KEY_REUSED', async () => {
                await service.dispatch({ month: '2026-11' }, KEY);

                await expect(service.dispatch({ month: '2026-12' }, KEY))
                    .rejects.toMatchObject({ code: 'SUMMARY_DISPATCH_KEY_REUSED', statusCode: 409 });
            });

            it('a mesma chave enquanto o envio ainda roda: 409 SUMMARY_DISPATCH_IN_PROGRESS', async () => {
                repository.seed({ month: NOVEMBER, idempotencyKey: KEY, status: 'RUNNING', runningMonth: NOVEMBER, finishedAt: null });

                await expect(service.dispatch({ month: '2026-11' }, KEY))
                    .rejects.toMatchObject({ code: 'SUMMARY_DISPATCH_IN_PROGRESS', statusCode: 409 });
            });

            it('outro envio do mesmo mês rodando (chave diferente): 409, sem enviar', async () => {
                repository.seed({ month: NOVEMBER, idempotencyKey: OTHER_KEY, status: 'RUNNING', runningMonth: NOVEMBER, finishedAt: null });

                await expect(service.dispatch({ month: '2026-11' }, KEY))
                    .rejects.toMatchObject({ code: 'SUMMARY_DISPATCH_IN_PROGRESS', reason: 'summary_dispatch_month_running' });
                expect(mailer.sent).toEqual([]);
            });

            it('envio preso em RUNNING há mais de 5 minutos é marcado como INTERRUPTED e o novo segue', async () => {
                const stale = repository.seed({
                    month: NOVEMBER,
                    idempotencyKey: OTHER_KEY,
                    status: 'RUNNING',
                    runningMonth: NOVEMBER,
                    startedAt: new Date(Date.now() - STALE_DISPATCH_MS - 1000),
                    finishedAt: null
                });

                const result = await service.dispatch({ month: '2026-11' }, KEY);

                expect(result.status).toBe('DONE');
                expect(stale).toMatchObject({ status: 'INTERRUPTED', runningMonth: null });
            });

            it('corrida com a mesma chave: o create perde (P2002) e responde o envio que ganhou', async () => {
                const winner = repository.seed({ month: NOVEMBER, idempotencyKey: 'outra' });
                jest.spyOn(repository, 'findByKey')
                    .mockResolvedValueOnce(null)
                    .mockResolvedValueOnce({ ...winner, idempotencyKey: KEY });
                jest.spyOn(repository, 'start')
                    .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' }));

                const result = await service.dispatch({ month: '2026-11' }, KEY);

                expect(result.id).toBe(winner.id);
                expect(mailer.sent).toEqual([]);
            });

            it('outro erro do banco ao começar o envio é repassado', async () => {
                jest.spyOn(repository, 'start').mockRejectedValueOnce(new Error('banco fora'));

                await expect(service.dispatch({ month: '2026-11' }, KEY)).rejects.toThrow('banco fora');
            });

            it('P2002 que não é P2002 de verdade (outro código) também é repassado', async () => {
                const error = new Prisma.PrismaClientKnownRequestError('Foreign key', { code: 'P2003', clientVersion: 'teste' });
                jest.spyOn(repository, 'start').mockRejectedValueOnce(error);

                await expect(service.dispatch({ month: '2026-11' }, KEY)).rejects.toBe(error);
            });
        });

        it('erro inesperado no meio (ao gravar um item) marca o envio como INTERRUPTED e é repassado', async () => {
            jest.spyOn(repository, 'addItem').mockRejectedValueOnce(new Error('falha ao gravar'));

            await expect(service.dispatch({ month: '2026-11' }, KEY)).rejects.toThrow('falha ao gravar');
            expect(repository.dispatches[0]).toMatchObject({ status: 'INTERRUPTED', runningMonth: null });
        });
    });

    describe('preview', () => {
        it('lista as pessoas ativas com o e-mail mascarado e diz se o envio está ligado', async () => {
            mailer.enabled = false;

            const preview = await service.preview('2026-11');

            expect(preview).toEqual({
                month: '2026-11',
                enabled: false,
                recipients: [
                    { personId: ana.id, name: 'Ana', hasEmail: true, recipient: 'an•••@exemplo.com' },
                    { personId: bruno.id, name: 'Bruno', hasEmail: false, recipient: null },
                    { personId: carla.id, name: 'Carla', hasEmail: true, recipient: 'ca•••@exemplo.com' }
                ],
                lastDispatch: null,
                pending: { amount: '0.00', count: 0 }
            });
        });

        it('avisa as compras pendentes do mês (o front desabilita o botão de enviar)', async () => {
            summary.cardExpenses.push({ month: '2026-11', categoryId: 'casa', personId: null, amountCents: 1_234n, pending: true });

            await expect(service.preview('2026-11')).resolves.toMatchObject({ pending: { amount: '12.34', count: 1 } });
        });

        it('traz o último envio do mês', async () => {
            await service.dispatch({ month: '2026-11' }, KEY);
            const second = await service.dispatch({ month: '2026-11', personIds: [ana.id] }, OTHER_KEY);

            const preview = await service.preview('2026-11');

            expect(preview.lastDispatch).toEqual(second);
        });
    });

    describe('history', () => {
        it('lista os envios do mês, do mais recente para o mais antigo', async () => {
            const first = await service.dispatch({ month: '2026-11' }, KEY);
            const second = await service.dispatch({ month: '2026-11', personIds: [ana.id] }, OTHER_KEY);

            await expect(service.history('2026-11')).resolves.toEqual([second, first]);
            await expect(service.history('2026-12')).resolves.toEqual([]);
        });
    });

    describe('emailPreview', () => {
        it('mostra o e-mail de uma pessoa sem enviar', async () => {
            const preview = await service.emailPreview({ month: '2026-11', personId: ana.id });

            expect(preview).toMatchObject({ personId: ana.id, recipient: 'an•••@exemplo.com' });
            expect(preview.subject).toMatch(/^Golduck · Resumo de novembro\/2026/);
            expect(preview.text).toContain('Líquido: R$ 1.776,55');
            expect(mailer.sent).toEqual([]);
        });

        it('pessoa sem e-mail: recipient null; pessoa fora da divisão: 400', async () => {
            await expect(service.emailPreview({ month: '2026-11', personId: bruno.id })).resolves.toMatchObject({ recipient: null });
            await expect(service.emailPreview({ month: '2026-11', personId: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f' }))
                .rejects.toMatchObject({ code: 'SUMMARY_DISPATCH_UNKNOWN_PERSON' });
        });
    });
});
