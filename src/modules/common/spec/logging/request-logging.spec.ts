import type { LogSettings } from '../../logging/log-settings.js';
import type { RequestFailure } from '../../logging/request-log.context.js';
import type { LoggerService } from '../../provider/logger.service.js';
import { jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import { fastify } from 'fastify';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

import { getAppInfo } from '../../logging/app-info.js';
import { generateRequestId } from '../../logging/request-id.js';
import { RequestLogContext } from '../../logging/request-log.context.js';
import { registerRequestLogging } from '../../logging/request-logging.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    readonly level: Level;
    readonly message: string;
    readonly data: Record<string, unknown>;
}

/** Logger falso: guarda cada chamada, sem escrever nada no console. */
class FakeLogger {
    public readonly entries: LogEntry[] = [];

    public debug(message: string, data: Record<string, unknown> = {}): void {
        this.entries.push({ level: 'debug', message, data });
    }

    public info(message: string, data: Record<string, unknown> = {}): void {
        this.entries.push({ level: 'info', message, data });
    }

    public warn(message: string, data: Record<string, unknown> = {}): void {
        this.entries.push({ level: 'warn', message, data });
    }

    public error(message: string, data: Record<string, unknown> = {}): void {
        this.entries.push({ level: 'error', message, data });
    }
}

const SETTINGS: LogSettings = {
    level: 'debug',
    format: 'json',
    requestBody: 'errors',
    slowRequestMs: 1000,
    slowQueryMs: 500,
    silent: true
};

const REQUEST_ID = 'req-abcdefgh-1234';

/*
 * Uma linha de log por requisição, num Fastify de verdade (porta local + fetch): campos, nível
 * conforme status/lentidão/@QuietRequestLog e quando o corpo entra no log.
 */
describe('registerRequestLogging', () => {
    let app: FastifyInstance;
    let logger: FakeLogger;
    let context: RequestLogContext;
    let baseUrl: string;
    /** Duração que o contexto devolve (o tempo real varia a cada execução). */
    let durationMs: number;

    const start = async (settings: LogSettings | 'ambiente' = SETTINGS): Promise<void> => {
        app = fastify({ genReqId: generateRequestId });
        logger = new FakeLogger();
        context = new RequestLogContext();
        durationMs = 7;

        const finish = context.finish.bind(context) as RequestLogContext['finish'];
        jest.spyOn(context, 'finish').mockImplementation(request => ({ ...finish(request), durationMs }));

        if (settings === 'ambiente') {
            registerRequestLogging(app, logger as unknown as LoggerService, context);
        } else {
            registerRequestLogging(app, logger as unknown as LoggerService, context, settings);
        }

        // Corpos que o Fastify não entende por padrão: multipart (simulado) e sem content-type.
        app.addContentTypeParser('multipart/form-data', { parseAs: 'string' }, (_request, body, done) => {
            done(null, { arquivo: body });
        });
        app.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => {
            done(null, { texto: body });
        });

        app.addHook('preHandler', (request, _reply, done) => {
            const user = request.headers['x-test-user'];
            if (typeof user === 'string') {
                Object.assign(request, { auth: JSON.parse(user) as unknown });
            }

            const failure = request.headers['x-test-failure'];
            if (typeof failure === 'string') {
                context.recordFailure(request, JSON.parse(failure) as RequestFailure);
            }

            done();
        });

        app.route({
            method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            url: '/status/:code',
            handler: async (request, reply) => reply.code(Number((request.params as { code: string }).code)).send({ ok: true })
        });
        app.get('/quiet/:code', { config: { quietRequestLog: true } }, async (request, reply) =>
            reply.code(Number((request.params as { code: string }).code)).send({ ok: true }));
        app.get('/quase-quiet', { config: { quietRequestLog: 'sim' } }, async (_request, reply) => reply.send({ ok: true }));
        app.get('/vazio', async (_request, reply) => reply.code(204).send());
        app.get('/stream', async (_request, reply) => reply.type('text/plain').send(Readable.from(['a', 'b'])));

        await app.listen({ port: 0, host: '127.0.0.1' });
        baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    };

    /** Faz a requisição e espera a linha de log (o onResponse roda depois de a resposta sair). */
    const call = async (path: string, init: RequestInit = {}): Promise<{ response: Response; entry: LogEntry }> => {
        const count = logger.entries.length;
        const response = await fetch(`${baseUrl}${path}`, init);
        await response.arrayBuffer();

        for (let attempt = 0; attempt < 200 && logger.entries.length === count; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        expect(logger.entries).toHaveLength(count + 1);

        return { response, entry: logger.entries[count] };
    };

    const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await app.close();
    });

    describe('headers e campos', () => {
        beforeEach(async () => {
            await start();
        });

        it('devolve x-request-id e x-app-version em toda resposta, inclusive 404', async () => {
            const { response } = await call('/status/200', { headers: { 'x-request-id': REQUEST_ID } });
            const { response: notFound } = await call('/nao-existe');

            expect(response.headers.get('x-request-id')).toBe(REQUEST_ID);
            expect(response.headers.get('x-app-version')).toBe(getAppInfo().version);
            expect(notFound.status).toBe(404);
            expect(notFound.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
            expect(notFound.headers.get('x-app-version')).toBe(getAppInfo().version);
        });

        it('sucesso: info "Requisição concluída" com id, rota, caminho, query sem segredos, status, tamanho, IP e user agent', async () => {
            const { entry } = await call('/status/200?page=2&token=abc', {
                headers: { 'x-request-id': REQUEST_ID, 'user-agent': 'teste/1.0' }
            });

            expect(entry.level).toBe('info');
            expect(entry.message).toBe('Requisição concluída');
            expect(entry.data).toEqual({
                requestId: REQUEST_ID,
                method: 'GET',
                route: '/status/:code',
                path: '/status/200',
                query: { page: '2', token: '[oculto]' },
                statusCode: 200,
                durationMs: 7,
                responseBytes: Buffer.byteLength('{"ok":true}'),
                ip: '127.0.0.1',
                userAgent: 'teste/1.0'
            });
            expect(entry.data.slow).toBeUndefined();
            expect(entry.data.code).toBeUndefined();
            expect(entry.data.body).toBeUndefined();
        });

        it('sem query, o campo query fica de fora', async () => {
            const { entry } = await call('/status/200');

            expect(entry.data.query).toBeUndefined();
            expect(entry.data.path).toBe('/status/200');
        });

        it('identifica o usuário logado', async () => {
            const { entry } = await call('/status/200', {
                headers: { 'x-test-user': JSON.stringify({ userId: 'id-1', email: 'pessoa@exemplo.com', role: 'ADMIN' }) }
            });

            expect(entry.data).toMatchObject({ userId: 'id-1', userEmail: 'pessoa@exemplo.com', role: 'ADMIN' });
        });

        it('tamanho da resposta só quando há content-length maior que zero', async () => {
            const { entry: empty } = await call('/vazio');
            const { entry: stream } = await call('/stream');

            expect(empty.data.statusCode).toBe(204);
            expect(empty.data.responseBytes).toBeUndefined();
            expect(stream.data.responseBytes).toBeUndefined();
        });

        it('rota inexistente: sem rota, código HTTP_404', async () => {
            const { entry } = await call('/nao-existe?x=1');

            expect(entry.data).toMatchObject({ path: '/nao-existe', statusCode: 404, code: 'HTTP_404' });
            expect(entry.data.route).toBeUndefined();
        });
    });

    describe('nível conforme o resultado', () => {
        beforeEach(async () => {
            await start();
        });

        it('5xx: error "Requisição concluída com falha"', async () => {
            const { entry } = await call('/status/500');

            expect(entry).toMatchObject({ level: 'error', message: 'Requisição concluída com falha', data: { statusCode: 500, code: 'HTTP_500' } });
        });

        it('4xx: warn "Requisição rejeitada", de 400 a 499', async () => {
            for (const status of [400, 404, 499]) {
                const { entry } = await call(`/status/${status}`);

                expect(entry).toMatchObject({ level: 'warn', message: 'Requisição rejeitada', data: { statusCode: status, code: `HTTP_${status}` } });
            }
        });

        it('401 (sessão expirada é rotina) fica como info', async () => {
            const { entry } = await call('/status/401');

            expect(entry).toMatchObject({ level: 'info', message: 'Requisição concluída', data: { statusCode: 401, code: 'HTTP_401' } });
        });

        it('abaixo de 400 não tem código', async () => {
            const { entry } = await call('/status/399');

            expect(entry).toMatchObject({ level: 'info', data: { statusCode: 399 } });
            expect(entry.data.code).toBeUndefined();
        });

        it('lenta a partir de slowRequestMs: warn "Requisição lenta" com slow=true', async () => {
            durationMs = 1000;
            const { entry: slow } = await call('/status/200');
            const { entry: slow401 } = await call('/status/401');
            durationMs = 999;
            const { entry: fast } = await call('/status/200');

            expect(slow).toMatchObject({ level: 'warn', message: 'Requisição lenta', data: { durationMs: 1000, slow: true } });
            expect(slow401).toMatchObject({ level: 'warn', message: 'Requisição lenta' });
            expect(fast).toMatchObject({ level: 'info', data: { durationMs: 999 } });
            expect(fast.data.slow).toBeUndefined();
        });

        it('rota com @QuietRequestLog: sucesso em debug; falha e lentidão continuam aparecendo', async () => {
            const { entry: quiet } = await call('/quiet/200');
            const { entry: rejected } = await call('/quiet/404');
            durationMs = 5000;
            const { entry: slow } = await call('/quiet/200');

            expect(quiet).toMatchObject({ level: 'debug', message: 'Requisição concluída' });
            expect(rejected).toMatchObject({ level: 'warn', message: 'Requisição rejeitada' });
            expect(slow).toMatchObject({ level: 'warn', message: 'Requisição lenta' });
        });

        it('só a marca true deixa a rota quieta', async () => {
            const { entry } = await call('/quase-quiet');

            expect(entry.level).toBe('info');
        });
    });

    describe('falha registrada pelo filtro de erros', () => {
        beforeEach(async () => {
            await start();
        });

        it('leva código, motivo, detalhes (sem segredos), nome, mensagem e pilha do erro', async () => {
            const failure = {
                code: 'VALIDATION_ERROR',
                reason: 'joi',
                details: [{ field: 'password', value: 'segredo', token: 'x' }],
                errorName: 'Error',
                errorMessage: 'falhou',
                stack: 'Error: falhou\n    at x'
            };

            const { entry } = await call('/status/400', { headers: { 'x-test-failure': JSON.stringify(failure) } });

            expect(entry.data).toMatchObject({
                code: 'VALIDATION_ERROR',
                reason: 'joi',
                details: [{ field: 'password', value: 'segredo', token: '[oculto]' }],
                errorName: 'Error',
                errorMessage: 'falhou',
                stack: 'Error: falhou\n    at x'
            });
        });

        it('o código da falha vale mesmo com status de sucesso; sem detalhes o campo fica de fora', async () => {
            const { entry } = await call('/status/200', { headers: { 'x-test-failure': JSON.stringify({ code: 'ALGO' }) } });

            expect(entry.data.code).toBe('ALGO');
            expect('details' in entry.data).toBe(true);
            expect(entry.data.details).toBeUndefined();
            expect(entry.data.reason).toBeUndefined();
        });
    });

    describe('corpo da requisição', () => {
        const body = { name: 'Mercado', password: 'segredo' };
        const logged = { name: 'Mercado', password: '[oculto]' };

        it('modo errors (padrão): só nas falhas, sem senha', async () => {
            await start({ ...SETTINGS, requestBody: 'errors' });

            const { entry: created } = await call('/status/201', json('POST', body));
            const { entry: rejected } = await call('/status/400', json('POST', body));
            const { entry: lastOk } = await call('/status/399', json('POST', body));

            expect(created.data.body).toBeUndefined();
            expect(rejected.data.body).toEqual(logged);
            expect(lastOk.data.body).toBeUndefined();
        });

        it('modo all: em POST, PUT, PATCH e DELETE, também no sucesso', async () => {
            await start({ ...SETTINGS, requestBody: 'all' });

            for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
                const { entry } = await call('/status/200', json(method, body));

                expect(entry.data).toMatchObject({ method, body: logged });
            }
        });

        it('modo off: nunca', async () => {
            await start({ ...SETTINGS, requestBody: 'off' });

            const { entry } = await call('/status/400', json('POST', body));

            expect(entry.data.body).toBeUndefined();
        });

        it('outros métodos, corpo vazio ou null e uploads (multipart) nunca entram', async () => {
            await start({ ...SETTINGS, requestBody: 'all' });

            const { entry: options } = await call('/status/200', json('OPTIONS', body));
            const { entry: empty } = await call('/status/200', { method: 'POST' });
            const { entry: nullBody } = await call('/status/200', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
            const { entry: upload } = await call('/status/400', {
                method: 'POST',
                headers: { 'content-type': 'multipart/form-data; boundary=x' },
                body: 'conteúdo do arquivo'
            });

            expect(options.data.method).toBe('OPTIONS');
            expect(options.data.body).toBeUndefined();
            expect(empty.data.body).toBeUndefined();
            expect(nullBody.data.body).toBeUndefined();
            expect(upload.data.body).toBeUndefined();
        });

        it('corpo sem content-type ainda entra', async () => {
            await start({ ...SETTINGS, requestBody: 'all' });

            const { entry } = await call('/status/200', { method: 'POST', body: new TextEncoder().encode('oi') });

            expect(entry.data.body).toEqual({ texto: 'oi' });
        });
    });

    it('sem configuração explícita, lê LOG_* do ambiente', async () => {
        const originalEnv = process.env;
        process.env = { ...originalEnv, LOG_REQUEST_BODY: 'all', SLOW_REQUEST_MS: '50' };

        try {
            await start('ambiente');
            durationMs = 50;

            const { entry } = await call('/status/200', json('POST', { name: 'x' }));

            expect(entry).toMatchObject({ level: 'warn', message: 'Requisição lenta', data: { body: { name: 'x' } } });
        } finally {
            process.env = originalEnv;
        }
    });
});
