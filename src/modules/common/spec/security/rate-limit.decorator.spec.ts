import type { AppError } from '../../errors/app-error.js';
import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RateLimit, RateLimitGuard, RateLimitStore } from '../../security/index.js';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const ONE_MINUTE_MS = 60_000;

/* Rotas de mentira: o guard lê o @RateLimit do método ou da classe. */
class LimitedController {
    @RateLimit(2)
    public login(): string {
        return 'login';
    }

    @RateLimit(3, 2_400)
    public shortWindow(): string {
        return 'janela de 2,4 s';
    }

    @RateLimit(5, 0)
    public zeroWindow(): string {
        return 'janela de 0 ms';
    }

    public unlimited(): string {
        return 'sem limite';
    }
}

@RateLimit(4)
class ClassLimitedController {
    @RateLimit(1)
    public stricter(): string {
        return 'o método vale mais que a classe';
    }

    public inherited(): string {
        return 'herda o limite da classe';
    }
}

interface FakeRequest {
    readonly method: string;
    readonly url: string;
    readonly routeOptions: { readonly url?: string };
    readonly ip: string;
}

interface GuardRun {
    readonly allowed?: boolean;
    readonly error?: unknown;
    readonly headers: Record<string, unknown>;
}

const LOGIN_REQUEST: FakeRequest = { method: 'POST', url: '/api/auth/login', routeOptions: { url: '/api/auth/login' }, ip: '10.0.0.1' };

/** O método do protótipo, como o Nest entrega em getHandler() (com os metadados dos decorators). */
function handlerOf(controller: { readonly prototype: object }, method: string): unknown {
    return Object.getOwnPropertyDescriptor(controller.prototype, method)?.value;
}

/** Quantas janelas o store guarda (inclusive as vencidas que a varredura ainda não apagou). */
function storedWindows(store: RateLimitStore): number {
    return (store as unknown as { windows: Map<string, unknown> }).windows.size;
}

describe('RateLimitStore', () => {
    let store: RateLimitStore;

    beforeEach(() => {
        store = new RateLimitStore();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('hit abre a janela na primeira chamada e conta as seguintes dentro dela', () => {
        expect(store.hit('chave', ONE_MINUTE_MS, NOW)).toEqual({ count: 1, resetAt: NOW + ONE_MINUTE_MS });
        expect(store.hit('chave', ONE_MINUTE_MS, NOW + ONE_MINUTE_MS - 1)).toEqual({ count: 2, resetAt: NOW + ONE_MINUTE_MS });
    });

    it('no instante do resetAt a janela recomeça do zero', () => {
        store.hit('chave', ONE_MINUTE_MS, NOW);
        store.hit('chave', ONE_MINUTE_MS, NOW);

        expect(store.hit('chave', ONE_MINUTE_MS, NOW + ONE_MINUTE_MS)).toEqual({ count: 1, resetAt: NOW + 2 * ONE_MINUTE_MS });
    });

    it('cada chave tem a sua janela', () => {
        store.hit('a', ONE_MINUTE_MS, NOW);
        store.hit('a', ONE_MINUTE_MS, NOW);

        expect(store.hit('b', 1000, NOW)).toEqual({ count: 1, resetAt: NOW + 1000 });
        expect(store.peek('a', NOW)?.count).toBe(2);
    });

    it('peek mostra a janela sem contar uma chamada nova; vencida ou inexistente é undefined', () => {
        store.hit('chave', ONE_MINUTE_MS, NOW);

        expect(store.peek('chave', NOW)).toEqual({ count: 1, resetAt: NOW + ONE_MINUTE_MS });
        expect(store.peek('chave', NOW + ONE_MINUTE_MS - 1)).toEqual({ count: 1, resetAt: NOW + ONE_MINUTE_MS });
        expect(store.peek('chave', NOW + ONE_MINUTE_MS)).toBeUndefined();
        expect(store.peek('outra', NOW)).toBeUndefined();
        expect(store.hit('chave', ONE_MINUTE_MS, NOW).count).toBe(2);
    });

    it('reset apaga a contagem da chave (e não falha se ela não existir)', () => {
        store.hit('chave', ONE_MINUTE_MS, NOW);
        store.hit('outra', ONE_MINUTE_MS, NOW);

        store.reset('chave');
        store.reset('inexistente');

        expect(store.peek('chave', NOW)).toBeUndefined();
        expect(store.peek('outra', NOW)?.count).toBe(1);
        expect(store.hit('chave', ONE_MINUTE_MS, NOW).count).toBe(1);
    });

    it('sem "now", usa o relógio atual', () => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);

        expect(store.hit('chave', 1000)).toEqual({ count: 1, resetAt: NOW + 1000 });
        expect(store.peek('chave')).toEqual({ count: 1, resetAt: NOW + 1000 });

        jest.spyOn(Date, 'now').mockReturnValue(NOW + 1000);
        expect(store.peek('chave')).toBeUndefined();
    });

    it('apaga as janelas vencidas no máximo uma vez por minuto, para a memória não crescer', () => {
        // A primeira chamada já varre (não há nada) e agenda a próxima varredura para NOW + 1 min.
        store.hit('a', 1000, NOW);
        // Antes da próxima varredura, as vencidas continuam guardadas.
        store.hit('b', 59_000, NOW + 1000);
        store.hit('c', 1000, NOW + ONE_MINUTE_MS - 1);
        expect(storedWindows(store)).toBe(3);

        // Na hora da varredura: "a" (venceu antes) e "b" (vence agora) saem; "c" ainda vale.
        store.hit('d', 1000, NOW + ONE_MINUTE_MS);
        expect(storedWindows(store)).toBe(2);
        expect(store.peek('c', NOW + ONE_MINUTE_MS)?.count).toBe(1);

        // A próxima varredura só acontece 1 minuto depois da anterior.
        store.hit('e', 1000, NOW + 2 * ONE_MINUTE_MS - 1);
        expect(storedWindows(store)).toBe(3);
        store.hit('f', 1000, NOW + 2 * ONE_MINUTE_MS);
        expect(storedWindows(store)).toBe(2);
    });
});

describe('RateLimitGuard', () => {
    let store: RateLimitStore;
    let guard: RateLimitGuard;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        store = new RateLimitStore();
        guard = new RateLimitGuard(new Reflector(), store);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** Roda o guard e devolve o resultado (ou o erro) e os headers gravados na resposta. */
    const run = (controller: { readonly prototype: object }, method: string, request: Partial<FakeRequest> = {}): GuardRun => {
        const headers: Record<string, unknown> = {};
        const reply = {
            header: (name: string, value: unknown): unknown => {
                headers[name] = value;
                return reply;
            }
        };
        const handler = handlerOf(controller, method);
        const context = {
            getClass: () => controller,
            getHandler: () => handler,
            switchToHttp: () => ({ getRequest: () => ({ ...LOGIN_REQUEST, ...request }), getResponse: () => reply })
        } as unknown as ExecutionContext;

        try {
            return { allowed: guard.canActivate(context), headers };
        } catch (error) {
            return { error, headers };
        }
    };

    const login = (request: Partial<FakeRequest> = {}): GuardRun => run(LimitedController, 'login', request);

    it('rota sem @RateLimit passa sem contar nem mandar headers', () => {
        const hit = jest.spyOn(store, 'hit');

        expect(run(LimitedController, 'unlimited')).toEqual({ allowed: true, headers: {} });
        expect(hit).not.toHaveBeenCalled();
    });

    it('toda resposta traz o limite, quantas chamadas restam e em quantos segundos a janela recomeça', () => {
        expect(login()).toEqual({ allowed: true, headers: { 'x-ratelimit-limit': 2, 'x-ratelimit-remaining': 1, 'x-ratelimit-reset': 60 } });
        expect(login().headers).toEqual({ 'x-ratelimit-limit': 2, 'x-ratelimit-remaining': 0, 'x-ratelimit-reset': 60 });
    });

    it('passou do limite: 429 TOO_MANY_REQUESTS com Retry-After, e o restante nunca fica negativo', () => {
        login();
        login();

        const blocked = login();
        expect(blocked.error).toMatchObject({
            code: 'TOO_MANY_REQUESTS',
            statusCode: 429,
            reason: 'rate_limit: 2/60s',
            headers: { 'retry-after': '60' }
        } satisfies Partial<AppError>);
        expect(blocked.headers).toEqual({ 'x-ratelimit-limit': 2, 'x-ratelimit-remaining': 0, 'x-ratelimit-reset': 60 });

        expect(login().headers['x-ratelimit-remaining']).toBe(0);
    });

    it('a contagem recomeça quando a janela vence', () => {
        login();
        login();
        expect(login().error).toBeDefined();

        jest.spyOn(Date, 'now').mockReturnValue(NOW + ONE_MINUTE_MS);
        expect(login()).toMatchObject({ allowed: true, headers: { 'x-ratelimit-remaining': 1 } });
    });

    it('os segundos até recomeçar são arredondados para cima', () => {
        login();

        jest.spyOn(Date, 'now').mockReturnValue(NOW + ONE_MINUTE_MS - 1200);
        expect(login().headers['x-ratelimit-reset']).toBe(2);

        jest.spyOn(Date, 'now').mockReturnValue(NOW + ONE_MINUTE_MS - 1);
        expect(login().error).toMatchObject({ headers: { 'retry-after': '1' } });
    });

    it('janela própria: o motivo mostra a janela em segundos arredondados', () => {
        for (let call = 0; call < 3; call++) {
            expect(run(LimitedController, 'shortWindow').allowed).toBe(true);
        }

        expect(run(LimitedController, 'shortWindow').error).toMatchObject({ reason: 'rate_limit: 3/2s', headers: { 'retry-after': '3' } });
    });

    it('nunca anuncia recomeço em menos de 1 segundo (nem com janela de 0 ms)', () => {
        expect(run(LimitedController, 'zeroWindow').headers['x-ratelimit-reset']).toBe(1);
    });

    it('conta por método, rota e IP', () => {
        login();
        login();

        expect(login({ ip: '10.0.0.2' }).allowed).toBe(true);
        expect(login({ method: 'GET' }).allowed).toBe(true);
        expect(login({ routeOptions: { url: '/api/auth/refresh' } }).allowed).toBe(true);
        expect(login().error).toBeDefined();

        expect(store.peek('POST /api/auth/login 10.0.0.1', NOW)?.count).toBe(3);
    });

    it('usa o padrão da rota (:id), então ids diferentes contam juntos', () => {
        const route = { routeOptions: { url: '/api/itens/:id' } };

        login({ ...route, url: '/api/itens/1' });
        login({ ...route, url: '/api/itens/2' });

        expect(login({ ...route, url: '/api/itens/3' }).error).toBeDefined();
    });

    it('sem o padrão da rota, usa a URL sem a query string', () => {
        login({ routeOptions: {}, url: '/api/x?pagina=1' });
        login({ routeOptions: {}, url: '/api/x?pagina=2' });

        expect(login({ routeOptions: {}, url: '/api/x' }).error).toBeDefined();
        expect(login({ routeOptions: {}, url: '/api/y?pagina=1' }).allowed).toBe(true);
        expect(store.peek('POST /api/x 10.0.0.1', NOW)?.count).toBe(3);
    });

    it('o @RateLimit da classe vale para os métodos; o do método tem prioridade', () => {
        expect(run(ClassLimitedController, 'inherited').headers['x-ratelimit-limit']).toBe(4);
        expect(run(ClassLimitedController, 'stricter').headers['x-ratelimit-limit']).toBe(1);
    });
});

describe('@RateLimit', () => {
    const reflector = new Reflector();

    it('liga o RateLimitGuard na rota e documenta o 429 no Swagger', () => {
        const handler = handlerOf(LimitedController, 'login') as () => unknown;

        expect(reflector.get<unknown[]>('__guards__', handler)).toEqual([RateLimitGuard]);
        expect(reflector.get<Record<string, { description: string }>>('swagger/apiResponse', handler)['429']).toMatchObject({
            description: 'Muitas tentativas; veja o header Retry-After'
        });
    });

    it('janela padrão de 1 minuto', () => {
        const handler = handlerOf(LimitedController, 'login') as () => unknown;

        expect(reflector.get<unknown>('security:rateLimit', handler)).toEqual({ limit: 2, windowMs: ONE_MINUTE_MS });
    });
});
