import type { AppError } from '../../common/errors/app-error.js';
import { jest } from '@jest/globals';

import { RateLimitStore } from '../../common/security/index.js';
import { LOGIN_FAILURE_WINDOW_MS, LOGIN_MAX_FAILURES_PER_EMAIL, LoginAttemptsService } from '../security/login-attempts.service.js';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const EMAIL = 'pessoa@exemplo.com';

/** O erro lançado (o serviço é síncrono). */
function thrownBy(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }

    throw new Error('era esperado um erro');
}

describe('LoginAttemptsService', () => {
    let store: RateLimitStore;
    let attempts: LoginAttemptsService;

    beforeEach(() => {
        store = new RateLimitStore();
        attempts = new LoginAttemptsService(store);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const fail = (times: number, email: string = EMAIL, now: number = NOW): void => {
        for (let attempt = 0; attempt < times; attempt++) {
            attempts.registerFailure(email, now);
        }
    };

    it('aceita até 10 erros em 15 minutos', () => {
        expect(LOGIN_MAX_FAILURES_PER_EMAIL).toBe(10);
        expect(LOGIN_FAILURE_WINDOW_MS).toBe(15 * 60 * 1000);
    });

    it('com 9 erros ainda deixa tentar; no 10º trava com 429 e Retry-After até o fim da janela', () => {
        fail(9);
        expect(() => attempts.assertAllowed(EMAIL, NOW)).not.toThrow();

        fail(1);
        const error = thrownBy(() => attempts.assertAllowed(EMAIL, NOW + 60_000));

        expect(error).toMatchObject({
            code: 'TOO_MANY_REQUESTS',
            statusCode: 429,
            reason: 'login_failures: 10/15min',
            headers: { 'retry-after': String(14 * 60) }
        } satisfies Partial<AppError>);
    });

    it('o Retry-After arredonda para cima os segundos que faltam', () => {
        fail(10);

        expect(thrownBy(() => attempts.assertAllowed(EMAIL, NOW + LOGIN_FAILURE_WINDOW_MS - 1500))).toMatchObject({
            headers: { 'retry-after': '2' }
        });
    });

    it('a trava acaba quando a janela de 15 minutos vence', () => {
        fail(10);

        expect(() => attempts.assertAllowed(EMAIL, NOW + LOGIN_FAILURE_WINDOW_MS - 1)).toThrow();
        expect(() => attempts.assertAllowed(EMAIL, NOW + LOGIN_FAILURE_WINDOW_MS)).not.toThrow();
    });

    it('conta o e-mail sem diferenciar maiúsculas nem espaços nas pontas', () => {
        fail(5, '  Pessoa@Exemplo.COM ');
        fail(5, EMAIL);

        expect(() => attempts.assertAllowed('PESSOA@exemplo.com', NOW)).toThrow();
    });

    it('cada e-mail tem a sua contagem', () => {
        fail(10, 'outra@exemplo.com');

        expect(() => attempts.assertAllowed(EMAIL, NOW)).not.toThrow();
    });

    it('reset (login certo) zera os erros do e-mail', () => {
        fail(10);
        attempts.reset(' PESSOA@exemplo.com');

        expect(() => attempts.assertAllowed(EMAIL, NOW)).not.toThrow();
        expect(store.peek(`login-failures ${EMAIL}`, NOW)).toBeUndefined();
    });

    it('usa uma chave própria no store compartilhado com o @RateLimit', () => {
        fail(3);

        expect(store.peek(`login-failures ${EMAIL}`, NOW)).toEqual({ count: 3, resetAt: NOW + LOGIN_FAILURE_WINDOW_MS });
        expect(store.peek(EMAIL, NOW)).toBeUndefined();
    });

    it('sem "now", usa o relógio atual', () => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);

        attempts.registerFailure(EMAIL);
        expect(store.peek(`login-failures ${EMAIL}`, NOW)?.resetAt).toBe(NOW + LOGIN_FAILURE_WINDOW_MS);

        fail(9);
        expect(() => attempts.assertAllowed(EMAIL)).toThrow();

        jest.spyOn(Date, 'now').mockReturnValue(NOW + LOGIN_FAILURE_WINDOW_MS);
        expect(() => attempts.assertAllowed(EMAIL)).not.toThrow();
    });
});
