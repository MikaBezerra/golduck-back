import type { LoggerService } from '../../provider/logger.service';
import { jest } from '@jest/globals';

import { PrismaClient } from '../../../../generated/prisma/client';
import { databaseSchema, PrismaService } from '../../provider/prisma.provider';

type EventName = 'query' | 'warn' | 'error';
type Listener = (event: Record<string, unknown>) => void;

/** O que o Prisma guarda das opções do construtor (campos internos do client, lidos só para conferir). */
interface EngineConfig {
    readonly logLevel?: string;
    readonly logQueries?: boolean;
    readonly adapter: {
        readonly config: { readonly connectionString?: string };
        readonly options?: { readonly schema?: string };
    };
}

const fakeLogger = () => ({
    debug: jest.fn<LoggerService['debug']>(),
    info: jest.fn<LoggerService['info']>(),
    warn: jest.fn<LoggerService['warn']>(),
    error: jest.fn<LoggerService['error']>()
});

/*
 * Sem banco: o client é criado (o Prisma só conecta no $connect), mas $connect/$disconnect são
 * espionados e os eventos de log são entregues chamando direto os listeners registrados com $on.
 */
describe('PrismaService', () => {
    const originalEnv = process.env;
    const prototype = PrismaClient.prototype as unknown as {
        $on: (event: string, listener: Listener) => unknown;
        $connect: () => Promise<void>;
        $disconnect: () => Promise<void>;
    };
    let on: jest.SpiedFunction<typeof prototype.$on>;

    const engineConfig = (service: PrismaService): EngineConfig =>
        // eslint-disable-next-line no-underscore-dangle -- campo interno do PrismaClient, lido só no teste
        (service as unknown as { _engineConfig: EngineConfig })._engineConfig;

    /** Listener registrado para o evento (o $on de verdade continua sendo chamado). */
    const listener = (event: EventName): Listener => {
        const call = on.mock.calls.find(([name]) => name === event);

        if (!call) {
            throw new Error(`nenhum listener de ${event}`);
        }

        return call[1];
    };

    beforeEach(() => {
        process.env = { ...originalEnv, DATABASE_URL: 'postgresql://u:p@banco:5432/golduck', SLOW_QUERY_MS: '100' };
        on = jest.spyOn(prototype, '$on');
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    it('usa o adapter do Postgres com a DATABASE_URL do ambiente', () => {
        const service = new PrismaService();

        expect(engineConfig(service).adapter.config.connectionString).toBe('postgresql://u:p@banco:5432/golduck');
    });

    it('sem ?schema= na URL: não indica schema ao adapter (o Prisma usa o public)', () => {
        const service = new PrismaService();

        expect(engineConfig(service).adapter.options?.schema).toBeUndefined();
    });

    it('com ?schema= na URL: repassa o schema ao adapter e mantém a URL como veio', () => {
        process.env.DATABASE_URL = 'postgresql://u:p@ep-x-pooler.neon.tech/golduck?sslmode=require&schema=develop';
        const service = new PrismaService();

        expect(engineConfig(service).adapter.options?.schema).toBe('develop');
        expect(engineConfig(service).adapter.config.connectionString).toBe('postgresql://u:p@ep-x-pooler.neon.tech/golduck?sslmode=require&schema=develop');
    });

    it('sem logger (scripts): não pede eventos de log ao Prisma nem registra listeners', () => {
        const service = new PrismaService();

        expect(engineConfig(service).logQueries).toBe(false);
        expect(engineConfig(service).logLevel).toBeUndefined();
        expect(on).not.toHaveBeenCalled();
    });

    it('com logger: pede consultas, avisos e erros como eventos e escuta os três', () => {
        const service = new PrismaService(fakeLogger() as unknown as LoggerService);

        expect(engineConfig(service).logQueries).toBe(true);
        expect(engineConfig(service).logLevel).toBe('error');
        expect(on.mock.calls.map(([name]) => name)).toEqual(['query', 'warn', 'error']);
    });

    describe('eventos', () => {
        let logger: ReturnType<typeof fakeLogger>;

        beforeEach(() => {
            logger = fakeLogger();
            new PrismaService(logger as unknown as LoggerService);
        });

        it('consulta a partir de SLOW_QUERY_MS: warn "Consulta lenta no banco", sem os parâmetros', () => {
            listener('query')({ query: 'SELECT * FROM "Category" WHERE id = $1', params: '["id-secreto"]', duration: 100, target: 'quaint::connector' });

            expect(logger.warn).toHaveBeenCalledWith('Consulta lenta no banco', {
                durationMs: 100,
                sql: 'SELECT * FROM "Category" WHERE id = $1'
            });
            expect(logger.debug).not.toHaveBeenCalled();
        });

        it('consulta abaixo do limite: debug, com a duração arredondada', () => {
            listener('query')({ query: 'SELECT 1', params: '[]', duration: 99.6, target: 'x' });
            listener('query')({ query: 'SELECT 2', params: '[]', duration: 12.4, target: 'x' });

            expect(logger.debug.mock.calls).toEqual([
                ['Consulta no banco', { durationMs: 100, sql: 'SELECT 1' }],
                ['Consulta no banco', { durationMs: 12, sql: 'SELECT 2' }]
            ]);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('SQL até 1000 caracteres vai inteiro; acima disso é encurtado', () => {
            const limit = `SELECT ${'x'.repeat(993)}`;
            const tooLong = `SELECT ${'y'.repeat(1000)}`;

            listener('query')({ query: limit, params: '[]', duration: 1, target: 'x' });
            listener('query')({ query: tooLong, params: '[]', duration: 1, target: 'x' });

            expect(limit).toHaveLength(1000);
            expect(logger.debug.mock.calls.map(([, data]) => data?.sql)).toEqual([limit, `${tooLong.slice(0, 1000)}… (+7)`]);
        });

        it('aviso do Prisma vira warn e erro do Prisma vira error, com mensagem e origem', () => {
            listener('warn')({ message: 'pool quase cheio', target: 'pool', timestamp: new Date() });
            listener('error')({ message: 'conexão recusada', target: 'connector', timestamp: new Date() });

            expect(logger.warn).toHaveBeenCalledWith('Aviso do Prisma', { detail: 'pool quase cheio', target: 'pool' });
            expect(logger.error).toHaveBeenCalledWith('Erro do Prisma', { detail: 'conexão recusada', target: 'connector' });
        });
    });

    it('lê SLOW_QUERY_MS ao ser criado (padrão 500 ms)', () => {
        delete process.env.SLOW_QUERY_MS;
        const logger = fakeLogger();
        new PrismaService(logger as unknown as LoggerService);

        listener('query')({ query: 'SELECT 1', params: '[]', duration: 499, target: 'x' });
        listener('query')({ query: 'SELECT 2', params: '[]', duration: 500, target: 'x' });

        expect(logger.debug).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('conecta ao subir o módulo e desconecta ao desligar', async () => {
        const connect = jest.spyOn(prototype, '$connect').mockResolvedValue(undefined);
        const disconnect = jest.spyOn(prototype, '$disconnect').mockResolvedValue(undefined);
        const service = new PrismaService();

        await service.onModuleInit();
        expect(connect).toHaveBeenCalledTimes(1);
        expect(disconnect).not.toHaveBeenCalled();

        await service.onModuleDestroy();
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('falha ao conectar sobe junto (a API não fica no ar sem banco)', async () => {
        jest.spyOn(prototype, '$connect').mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(new PrismaService().onModuleInit()).rejects.toThrow('ECONNREFUSED');
    });
});

describe('databaseSchema', () => {
    it('lê o parâmetro schema da URL', () => {
        expect(databaseSchema('postgresql://u:p@host/db?schema=production')).toBe('production');
        expect(databaseSchema('postgres://u:p@host:5432/db?sslmode=require&schema=develop')).toBe('develop');
    });

    it('sem URL, sem o parâmetro ou com o parâmetro vazio: undefined', () => {
        expect(databaseSchema(undefined)).toBeUndefined();
        expect(databaseSchema('')).toBeUndefined();
        expect(databaseSchema('postgresql://u:p@host/db')).toBeUndefined();
        expect(databaseSchema('postgresql://u:p@host/db?sslmode=require')).toBeUndefined();
        expect(databaseSchema('postgresql://u:p@host/db?schema=')).toBeUndefined();
    });

    it('URL inválida: undefined, sem lançar erro (a validação da configuração é quem recusa)', () => {
        expect(databaseSchema('não é url')).toBeUndefined();
    });
});
