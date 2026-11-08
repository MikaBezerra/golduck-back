import { jest } from '@jest/globals';

import { Role } from '../../../../generated/prisma/enums.js';
import { dataOf, errorOf, HttpTestApp } from '../../../../testing/http-test-app.js';
import { PrismaService } from '../../provider/index.js';

type HealthBody = {
    status: string;
    info: Record<string, { status: string; uptime?: number }>;
    error: Record<string, unknown>;
    details: Record<string, { status: string; uptime?: number }>;
};

/*
 * /health (só ADMIN, consulta o banco) e /health/live (público, sem banco). O banco é um Prisma
 * falso: o indicador do Terminus faz o "ping" com $runCommandRaw, que aqui responde ou falha.
 */
describe('rotas /health', () => {
    let api: HttpTestApp;
    let ping: jest.Mock<(command: unknown) => Promise<unknown>>;

    const start = async (role?: Role): Promise<void> => {
        api = await HttpTestApp.create({
            imports: [],
            overrides: [{ provide: PrismaService, useValue: { $runCommandRaw: ping } }],
            role
        });
    };

    beforeEach(() => {
        ping = jest.fn(async () => Promise.resolve({ ok: 1 }));
    });

    afterEach(async () => {
        await api.close();
    });

    it('GET /health: ADMIN vê a API e o banco no ar', async () => {
        await start(Role.ADMIN);

        const response = await api.get('/health');
        const health = dataOf<HealthBody>(response);

        expect(response.status).toBe(200);
        expect(health.status).toBe('ok');
        expect(health.error).toEqual({});
        expect(health.info.database).toMatchObject({ status: 'up' });
        expect(health.info.http.status).toBe('up');
        expect(health.info.http.uptime).toBeGreaterThan(0);
        expect(health.details).toEqual(health.info);
        expect(ping).toHaveBeenCalledTimes(1);
        expect(ping).toHaveBeenCalledWith({ ping: 1 });
    });

    it('GET /health com o banco fora do ar: 503 SERVICE_UNAVAILABLE, sem detalhes do erro no corpo', async () => {
        ping.mockRejectedValue(new Error('conexão recusada em 10.0.0.5:5432'));
        await start(Role.ADMIN);

        const response = await api.get('/health');

        expect(response.status).toBe(503);
        expect(errorOf(response)).toEqual({
            code: 'SERVICE_UNAVAILABLE',
            message: 'Serviço indisponível',
            requestId: response.headers['x-request-id']
        });
        expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
    });

    it('GET /health: USER recebe 403 e sem login é 401, sem consultar o banco', async () => {
        await start(Role.USER);

        const forbidden = await api.get('/health');
        const anonymous = await api.get('/health', { auth: false });

        expect(forbidden.status).toBe(403);
        expect(errorOf(forbidden).code).toBe('AUTH_FORBIDDEN');
        expect(anonymous.status).toBe(401);
        expect(errorOf(anonymous).code).toBe('AUTH_UNAUTHENTICATED');
        expect(ping).not.toHaveBeenCalled();
    });

    it('GET /health/live: público, responde { status: "ok" } sem consultar o banco', async () => {
        ping.mockRejectedValue(new Error('banco fora'));
        await start();

        const anonymous = await api.get('/health/live', { auth: false });
        const logged = await api.get('/health/live');

        expect(anonymous.status).toBe(200);
        expect(anonymous.body).toEqual({ data: { status: 'ok' } });
        expect(logged.status).toBe(200);
        expect(ping).not.toHaveBeenCalled();
    });
});
