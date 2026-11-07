import type * as winston from 'winston';

import { formatPretty } from '../../logging/pretty-format';

type LogInfo = winston.Logform.TransformableInfo;

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';
const CYAN = '\u001b[36m';
const GREEN = '\u001b[32m';
const YELLOW = '\u001b[33m';
const RED = '\u001b[31m';
const MAGENTA = '\u001b[35m';

/** 07/11 13:15:05 no fuso da máquina (o mesmo que o formato usa). */
const TIMESTAMP = new Date(2026, 10, 7, 13, 15, 5).toISOString();
const PREFIX = `[API] ${process.pid} - 07/11 13:15:05`;

const info = (fields: Record<string, unknown>): LogInfo => ({ level: 'info', message: 'mensagem', timestamp: TIMESTAMP, ...fields });

const paint = (value: string, code: string): string => `${code}${value}${RESET}`;

/*
 * Formato legível do terminal (LOG_FORMAT=pretty): uma linha de resumo e linhas "↳" com código do erro,
 * detalhes, corpo e pilha. As cores dependem do terminal e de NO_COLOR/FORCE_COLOR.
 */
describe('formatPretty', () => {
    const originalEnv = process.env;
    const originalTty = {
        stdout: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
        stderr: Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')
    };

    const setTty = (stdout: boolean, stderr: boolean): void => {
        Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true, writable: true });
        Object.defineProperty(process.stderr, 'isTTY', { value: stderr, configurable: true, writable: true });
    };

    const restoreTty = (stream: NodeJS.WriteStream, descriptor: PropertyDescriptor | undefined): void => {
        if (descriptor) {
            Object.defineProperty(stream, 'isTTY', descriptor);
        } else {
            delete (stream as { isTTY?: boolean }).isTTY;
        }
    };

    beforeEach(() => {
        process.env = { ...originalEnv, NO_COLOR: '1' };
        delete process.env.FORCE_COLOR;
        setTty(false, false);
    });

    afterEach(() => {
        process.env = originalEnv;
        restoreTty(process.stdout, originalTty.stdout);
        restoreTty(process.stderr, originalTty.stderr);
    });

    describe('evento comum (sem requisição)', () => {
        it('uma linha com processo, data/hora, nível e mensagem', () => {
            expect(formatPretty(info({}))).toBe(`${PREFIX}  INFO  mensagem`);
            expect(formatPretty(info({ level: 'error' }))).toBe(`${PREFIX}  ERROR mensagem`);
            expect(formatPretty(info({ level: 'debug' }))).toBe(`${PREFIX}  DEBUG mensagem`);
        });

        it('demais campos viram "chave=valor", sem os campos de base e sem os indefinidos', () => {
            const line = formatPretty(info({
                message: 'API no ar',
                port: 3000,
                prefix: '/api',
                cors: ['https://a.test', 'https://b.test'],
                commit: undefined,
                swagger: false
            }));

            expect(line).toBe(`${PREFIX}  INFO  API no ar  port=3000  prefix=/api  cors=["https://a.test","https://b.test"]  swagger=false`);
        });

        it('erro: linha com nome e mensagem e, abaixo, a pilha sem a primeira linha', () => {
            const text = formatPretty(info({
                level: 'error',
                message: 'Falha ao iniciar a API',
                errorName: 'TypeError',
                errorMessage: 'x is not a function',
                stack: 'TypeError: x is not a function\n    at bootstrap (server.ts:10:5)\n    at main (server.ts:20:1)'
            }));

            expect(text.split('\n')).toEqual([
                `${PREFIX}  ERROR Falha ao iniciar a API`,
                '    ↳ TypeError: x is not a function',
                '      at bootstrap (server.ts:10:5)',
                '      at main (server.ts:20:1)'
            ]);
        });

        it('erro sem nome aparece como "Erro"; pilha sem mensagem também é mostrada', () => {
            expect(formatPretty(info({ errorMessage: 'deu ruim' })).split('\n')[1]).toBe('    ↳ Erro: deu ruim');
            expect(formatPretty(info({ stack: 'Error: x\n  at a' })).split('\n')).toEqual([`${PREFIX}  INFO  mensagem`, '      at a']);
        });
    });

    describe('requisição', () => {
        const request = (fields: Record<string, unknown>): LogInfo => info({
            message: 'Requisição concluída',
            method: 'GET',
            path: '/api/categories',
            statusCode: 200,
            durationMs: 12,
            requestId: '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f',
            ...fields
        });

        it('resumo: método, caminho, status, duração e o começo do id; nada do resto da mensagem', () => {
            expect(formatPretty(request({ route: '/api/categories', ip: '127.0.0.1' })))
                .toBe(`${PREFIX}  INFO   GET    /api/categories  200 +12ms  [3f2a9c1e]`);
        });

        it('mostra a query, o usuário (e-mail e papel, ou só o id) e marca a lenta', () => {
            const withEmail = formatPretty(request({
                query: { page: '2', tags: ['a', 'b'] },
                slow: true,
                userEmail: 'pessoa@exemplo.com',
                role: 'ADMIN',
                userId: 'id-1'
            }));
            const emailOnly = formatPretty(request({ userEmail: 'pessoa@exemplo.com', userId: 'id-1' }));
            const idOnly = formatPretty(request({ userId: 'id-1' }));

            expect(withEmail).toBe(`${PREFIX}  INFO   GET    /api/categories?page=2&tags=["a","b"]  200 +12ms lenta  [3f2a9c1e]  pessoa@exemplo.com (ADMIN)`);
            expect(emailOnly).toBe(`${PREFIX}  INFO   GET    /api/categories  200 +12ms  [3f2a9c1e]  pessoa@exemplo.com`);
            expect(idOnly).toBe(`${PREFIX}  INFO   GET    /api/categories  200 +12ms  [3f2a9c1e]  usuário=id-1`);
        });

        it('query vazia ou que não é objeto não aparece', () => {
            for (const query of [{}, null, 'page=2', undefined]) {
                expect(formatPretty(request({ query }))).toBe(`${PREFIX}  INFO   GET    /api/categories  200 +12ms  [3f2a9c1e]`);
            }
        });

        it('sem status, duração ou id: 0, +0ms e "-"', () => {
            expect(formatPretty(request({ statusCode: '200', durationMs: '12', requestId: 123, slow: 'sim' })))
                .toBe(`${PREFIX}  INFO   GET    /api/categories  0 +0ms  [-]`);
        });

        it('falha: linhas ↳ com código e motivo, detalhes da validação e corpo', () => {
            const text = formatPretty(request({
                level: 'warn',
                method: 'POST',
                path: '/api/auth/login',
                statusCode: 429,
                durationMs: 1,
                code: 'TOO_MANY_REQUESTS',
                reason: 'rate_limit: 5/60s',
                details: [{ field: 'email', message: 'obrigatório' }],
                body: { email: 'pessoa@exemplo.com', password: '[oculto]' }
            }));

            expect(text.split('\n')).toEqual([
                `${PREFIX}  WARN   POST   /api/auth/login  429 +1ms  [3f2a9c1e]`,
                '    ↳ TOO_MANY_REQUESTS · rate_limit: 5/60s',
                '    ↳ detalhes: [{"field":"email","message":"obrigatório"}]',
                '    ↳ corpo: {"email":"pessoa@exemplo.com","password":"[oculto]"}'
            ]);
        });

        it('código sem motivo; corpo só aparece a partir do status 400', () => {
            const ok = formatPretty(request({ statusCode: 399, code: 'ALGO', reason: 42, body: { name: 'x' } }));
            const rejected = formatPretty(request({ statusCode: 400, body: { name: 'x' } }));

            expect(ok.split('\n')).toEqual([`${PREFIX}  INFO   GET    /api/categories  399 +12ms  [3f2a9c1e]`, '    ↳ ALGO']);
            expect(rejected.split('\n')).toEqual([`${PREFIX}  INFO   GET    /api/categories  400 +12ms  [3f2a9c1e]`, '    ↳ corpo: {"name":"x"}']);
        });

        it('erro 500: resumo, código e pilha', () => {
            const text = formatPretty(request({
                level: 'error',
                statusCode: 500,
                code: 'INTERNAL_ERROR',
                errorName: 'Error',
                errorMessage: 'banco fora do ar',
                stack: 'Error: banco fora do ar\n    at query (repo.ts:1:1)'
            }));

            expect(text.split('\n')).toEqual([
                `${PREFIX}  ERROR  GET    /api/categories  500 +12ms  [3f2a9c1e]`,
                '    ↳ INTERNAL_ERROR',
                '    ↳ Error: banco fora do ar',
                '      at query (repo.ts:1:1)'
            ]);
        });

        it('só é requisição quando método e caminho são textos', () => {
            expect(formatPretty(info({ method: 'GET' }))).toBe(`${PREFIX}  INFO  mensagem  method=GET`);
            expect(formatPretty(info({ path: '/api' }))).toBe(`${PREFIX}  INFO  mensagem  path=/api`);
        });
    });

    describe('cores', () => {
        beforeEach(() => {
            delete process.env.NO_COLOR;
        });

        it('pinta nível, método, status, id, query, lenta e código', () => {
            process.env.FORCE_COLOR = '1';

            const text = formatPretty(info({
                level: 'warn',
                message: 'Requisição rejeitada',
                method: 'POST',
                path: '/api/x',
                query: { a: '1' },
                statusCode: 404,
                durationMs: 3,
                slow: true,
                requestId: 'abcdefgh-1234',
                code: 'NOT_FOUND'
            }));

            expect(text.split('\n')).toEqual([
                `${PREFIX}  ${paint('WARN ', YELLOW)}  ${paint('POST  ', CYAN)} /api/x${paint('?a=1', DIM)}`
                + `  ${paint('404', YELLOW)} +3ms${paint(' lenta', YELLOW)}  ${paint('[abcdefgh]', DIM)}`,
                `    ↳ ${paint('NOT_FOUND', YELLOW)}`
            ]);
        });

        it('cor de cada nível (desconhecido fica verde) e dos campos extras', () => {
            process.env.FORCE_COLOR = '1';

            expect(formatPretty(info({ level: 'error' }))).toBe(`${PREFIX}  ${paint('ERROR', RED)} mensagem`);
            expect(formatPretty(info({ level: 'info' }))).toBe(`${PREFIX}  ${paint('INFO ', GREEN)} mensagem`);
            expect(formatPretty(info({ level: 'debug' }))).toBe(`${PREFIX}  ${paint('DEBUG', MAGENTA)} mensagem`);
            expect(formatPretty(info({ level: 'silly', port: 1, env: 'x' })))
                .toBe(`${PREFIX}  ${paint('SILLY', GREEN)} mensagem  ${paint('port=1  env=x', DIM)}`);
        });

        it('status: 5xx vermelho, 4xx amarelo, o resto verde', () => {
            process.env.FORCE_COLOR = '1';
            const statusOf = (statusCode: number): string => formatPretty(info({
                method: 'GET', path: '/p', statusCode, durationMs: 0, requestId: 'r', code: 'C'
            })).split('\n')[1];

            expect(statusOf(500)).toBe(`    ↳ ${paint('C', RED)}`);
            expect(statusOf(499)).toBe(`    ↳ ${paint('C', YELLOW)}`);
            expect(statusOf(400)).toBe(`    ↳ ${paint('C', YELLOW)}`);
            expect(statusOf(399)).toBe(`    ↳ ${paint('C', GREEN)}`);
        });

        it('sem terminal, sem FORCE_COLOR: sem cores', () => {
            expect(formatPretty(info({}))).toBe(`${PREFIX}  INFO  mensagem`);
        });

        it('FORCE_COLOR=0 não força cores', () => {
            process.env.FORCE_COLOR = '0';

            expect(formatPretty(info({}))).toBe(`${PREFIX}  INFO  mensagem`);
        });

        it('com terminal no stdout ou no stderr: com cores', () => {
            setTty(true, false);
            expect(formatPretty(info({}))).toBe(`${PREFIX}  ${paint('INFO ', GREEN)} mensagem`);

            setTty(false, true);
            expect(formatPretty(info({}))).toBe(`${PREFIX}  ${paint('INFO ', GREEN)} mensagem`);
        });

        it('NO_COLOR desliga as cores mesmo com terminal e FORCE_COLOR', () => {
            process.env.NO_COLOR = '';
            process.env.FORCE_COLOR = '1';
            setTty(true, true);

            expect(formatPretty(info({}))).toBe(`${PREFIX}  INFO  mensagem`);
        });
    });
});
