import { jest } from '@jest/globals';
import { EOL } from 'node:os';

import { getAppInfo } from '../../logging/app-info.js';
import { LoggerService } from '../../provider/logger.service.js';

interface Written {
    readonly stream: 'stdout' | 'stderr';
    readonly line: string;
}

/*
 * O logger escreve pelo transporte Console do winston, que usa console._stdout/_stderr. No teste o
 * console global vira um falso que só guarda as linhas: nada aparece no terminal e dá para conferir
 * o formato e para qual saída cada nível vai.
 */
describe('LoggerService', () => {
    const originalEnv = process.env;
    const originalConsole = globalThis.console;
    let written: Written[];

    /** Cria o logger com as variáveis do caso (o NODE_ENV=test do Jest silenciaria tudo). */
    const create = (env: Record<string, string>): LoggerService => {
        process.env = { ...originalEnv, NODE_ENV: 'production', NO_COLOR: '1', ...env };
        return new LoggerService();
    };

    /** O winston entrega ao transporte de forma assíncrona. */
    const flush = async (): Promise<void> => {
        for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(resolve => setImmediate(resolve));
        }
    };

    const jsonLines = (): Array<Record<string, unknown>> =>
        written.map(({ line }) => JSON.parse(line) as Record<string, unknown>);

    beforeEach(() => {
        written = [];
        const unused = (): void => undefined;
        const fakeConsole = {
            log: unused,
            warn: unused,
            error: unused,
            _stdout: { write: (line: string) => written.push({ stream: 'stdout', line: line.slice(0, -EOL.length) }) },
            _stderr: { write: (line: string) => written.push({ stream: 'stderr', line: line.slice(0, -EOL.length) }) }
        };
        globalThis.console = fakeConsole as unknown as Console;
    });

    afterEach(() => {
        globalThis.console = originalConsole;
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe('formato json', () => {
        it('uma linha JSON por evento, com a identificação da API, a hora e os campos recebidos', async () => {
            const logger = create({ APP_ENV: 'develop', LOG_LEVEL: 'debug' });
            const app = getAppInfo();

            logger.info('Requisição concluída', { statusCode: 200, path: '/api/categories' });
            await flush();

            expect(written).toHaveLength(1);
            const [line] = jsonLines();
            expect(line).toEqual({
                level: 'info',
                message: 'Requisição concluída',
                statusCode: 200,
                path: '/api/categories',
                service: app.name,
                version: app.version,
                commit: app.commit,
                env: app.environment,
                timestamp: expect.any(String) as unknown
            });
            expect(new Date(String(line.timestamp)).toISOString()).toBe(line.timestamp);
        });

        it('cada método no seu nível; error vai para o stderr e o resto para o stdout', async () => {
            const logger = create({ LOG_FORMAT: 'json', LOG_LEVEL: 'debug' });

            logger.debug('d');
            logger.info('i');
            logger.warn('w');
            logger.error('e', { code: 'X' });
            await flush();

            expect(written.map(({ stream }) => stream)).toEqual(['stdout', 'stdout', 'stdout', 'stderr']);
            expect(jsonLines().map(({ level, message }) => `${String(level)}:${String(message)}`)).toEqual(['debug:d', 'info:i', 'warn:w', 'error:e']);
            expect(jsonLines()[3]).toMatchObject({ code: 'X' });
        });

        it('sem metadados, só os campos padrão', async () => {
            const logger = create({ LOG_FORMAT: 'json' });

            logger.warn('aviso');
            await flush();

            expect(Object.keys(jsonLines()[0]).sort()).toEqual(['commit', 'env', 'level', 'message', 'service', 'timestamp', 'version']);
        });
    });

    describe('nível mínimo (LOG_LEVEL)', () => {
        it('padrão info: debug fica de fora', async () => {
            const logger = create({ LOG_FORMAT: 'json' });

            logger.debug('d');
            logger.info('i');
            await flush();

            expect(jsonLines().map(({ message }) => message)).toEqual(['i']);
        });

        it('warn: só warn e error', async () => {
            const logger = create({ LOG_FORMAT: 'json', LOG_LEVEL: 'warn' });

            logger.debug('d');
            logger.info('i');
            logger.warn('w');
            logger.error('e');
            await flush();

            expect(jsonLines().map(({ message }) => message)).toEqual(['w', 'e']);
        });
    });

    describe('formato pretty', () => {
        it('linha legível, sem os campos de identificação da API', async () => {
            const logger = create({ LOG_FORMAT: 'pretty' });

            logger.info('API no ar', { port: 3000 });
            logger.error('Falhou');
            await flush();

            expect(written).toHaveLength(2);
            expect(written[0].stream).toBe('stdout');
            expect(written[0].line).toMatch(new RegExp(`^\\[API\\] ${process.pid} - \\d{2}/\\d{2} \\d{2}:\\d{2}:\\d{2}  INFO  API no ar  port=3000$`));
            expect(written[1].stream).toBe('stderr');
            expect(written[1].line).toMatch(/ERROR Falhou$/);
        });

        it('é o padrão no ambiente local', async () => {
            const logger = create({ APP_ENV: 'local' });

            logger.info('oi');
            await flush();

            expect(written[0].line).toMatch(/^\[API\] .* INFO {2}oi$/);
        });
    });

    it('nos testes automatizados (NODE_ENV=test) não escreve nada', async () => {
        const logger = create({ NODE_ENV: 'test', LOG_FORMAT: 'json', LOG_LEVEL: 'debug' });

        logger.error('nada');
        logger.info('nada');
        await flush();

        expect(written).toEqual([]);
    });
});
