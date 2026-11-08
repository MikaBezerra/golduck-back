import type { Config } from '../../common/index.js';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { jest } from '@jest/globals';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { RefreshCookieService } from '../security/refresh-cookie.service.js';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

type CookieConfig = Pick<Config, 'API_PREFIX' | 'AUTH_COOKIE_NAME' | 'AUTH_COOKIE_SAMESITE' | 'AUTH_COOKIE_DOMAIN'>;

const BASE_CONFIG: CookieConfig = {
    API_PREFIX: '/api',
    AUTH_COOKIE_NAME: 'golduck_refresh',
    AUTH_COOKIE_SAMESITE: 'strict',
    AUTH_COOKIE_DOMAIN: undefined
};

/** Resposta falsa que só registra o setCookie. */
function fakeReply(): { reply: FastifyReply; setCookie: jest.Mock<(name: string, value: string, options: CookieSerializeOptions) => void> } {
    const setCookie = jest.fn<(name: string, value: string, options: CookieSerializeOptions) => void>();
    return { reply: { setCookie } as unknown as FastifyReply, setCookie };
}

describe('RefreshCookieService', () => {
    const serviceWith = (config: Partial<CookieConfig> = {}): RefreshCookieService =>
        new RefreshCookieService({ ...BASE_CONFIG, ...config } as Config);

    /** Atributos do cookie gravado pelo set (o mesmo conjunto usado no clear). */
    const optionsOf = (config: Partial<CookieConfig>): CookieSerializeOptions => {
        const { reply, setCookie } = fakeReply();
        serviceWith(config).set(reply, 'token', new Date(NOW + 1000));
        return setCookie.mock.calls[0][2];
    };

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('usa o nome de AUTH_COOKIE_NAME', () => {
        expect(serviceWith({ AUTH_COOKIE_NAME: 'outro_nome' }).name).toBe('outro_nome');
    });

    describe('read', () => {
        const requestWith = (cookies: Record<string, string>): FastifyRequest => ({ cookies }) as unknown as FastifyRequest;

        it('lê o valor do cookie com o nome configurado', () => {
            expect(serviceWith().read(requestWith({ golduck_refresh: 'valor', outro: 'x' }))).toBe('valor');
        });

        it('cookie ausente, vazio ou com outro nome devolve undefined', () => {
            expect(serviceWith().read(requestWith({}))).toBeUndefined();
            expect(serviceWith().read(requestWith({ golduck_refresh: '' }))).toBeUndefined();
            expect(serviceWith().read(requestWith({ refresh_token: 'valor' }))).toBeUndefined();
        });
    });

    describe('set', () => {
        it('grava o token httpOnly, Secure, SameSite configurado, Path <prefixo>/auth e Max-Age até vencer', () => {
            const { reply, setCookie } = fakeReply();

            serviceWith().set(reply, 'token-novo', new Date(NOW + 7 * 24 * 60 * 60 * 1000));

            expect(setCookie).toHaveBeenCalledTimes(1);
            expect(setCookie).toHaveBeenCalledWith('golduck_refresh', 'token-novo', {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                path: '/api/auth',
                maxAge: 7 * 24 * 60 * 60
            });
        });

        it('Max-Age em segundos, arredondado ao mais próximo e nunca negativo', () => {
            const maxAgeFor = (millisecondsLeft: number): number | undefined => {
                const { reply, setCookie } = fakeReply();
                serviceWith().set(reply, 'token', new Date(NOW + millisecondsLeft));
                return setCookie.mock.calls[0][2].maxAge;
            };

            expect(maxAgeFor(1400)).toBe(1);
            expect(maxAgeFor(1600)).toBe(2);
            expect(maxAgeFor(0)).toBe(0);
            expect(maxAgeFor(-5000)).toBe(0);
        });

        it('SameSite segue AUTH_COOKIE_SAMESITE', () => {
            expect(optionsOf({ AUTH_COOKIE_SAMESITE: 'lax' }).sameSite).toBe('lax');
            expect(optionsOf({ AUTH_COOKIE_SAMESITE: 'none' }).sameSite).toBe('none');
        });

        it('Domain só quando AUTH_COOKIE_DOMAIN vem preenchido', () => {
            expect(optionsOf({ AUTH_COOKIE_DOMAIN: '.exemplo.com' }).domain).toBe('.exemplo.com');
            expect(optionsOf({ AUTH_COOKIE_DOMAIN: '' })).not.toHaveProperty('domain');
            expect(optionsOf({ AUTH_COOKIE_DOMAIN: undefined })).not.toHaveProperty('domain');
        });

        it('o Path acompanha o API_PREFIX, com ou sem barras nas pontas', () => {
            const pathFor = (prefix: string): string | undefined => optionsOf({ API_PREFIX: prefix }).path;

            expect(pathFor('/v2')).toBe('/v2/auth');
            expect(pathFor('v2')).toBe('/v2/auth');
            expect(pathFor('/v2/')).toBe('/v2/auth');
            expect(pathFor('//v2//')).toBe('/v2/auth');
            expect(pathFor('/api/v2')).toBe('/api/v2/auth');
        });

        it('prefixo "/" põe o cookie em /auth; prefixo vazio usa o padrão /api', () => {
            expect(optionsOf({ API_PREFIX: '/' }).path).toBe('/auth');
            expect(optionsOf({ API_PREFIX: '///' }).path).toBe('/auth');
            expect(optionsOf({ API_PREFIX: '' }).path).toBe('/api/auth');
        });
    });

    describe('clear', () => {
        it('apaga o cookie com os mesmos atributos, valor vazio, Max-Age 0 e Expires no passado', () => {
            const { reply, setCookie } = fakeReply();

            serviceWith({ AUTH_COOKIE_DOMAIN: '.exemplo.com', AUTH_COOKIE_SAMESITE: 'lax', API_PREFIX: '/v2' }).clear(reply);

            expect(setCookie).toHaveBeenCalledTimes(1);
            expect(setCookie).toHaveBeenCalledWith('golduck_refresh', '', {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: '/v2/auth',
                domain: '.exemplo.com',
                maxAge: 0,
                expires: new Date(0)
            });
        });
    });
});
