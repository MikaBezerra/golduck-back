import type { AuthSession, User } from '../../../generated/prisma/client.js';
import type { TestResponse } from '../../../testing/http-test-app.js';
import type { AuthenticatedRequest } from '../security/jwt-auth.guard.js';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

import { Role } from '../../../generated/prisma/enums.js';
import { dataOf, errorOf, HttpTestApp, TEST_ENV, TEST_SESSION_ID, TEST_USER_EMAIL, TEST_USER_ID } from '../../../testing/http-test-app.js';
import { AuthController } from '../controller/auth.controller.js';
import { AuthRepository } from '../repository/auth.repository.js';
import { PasswordService } from '../security/password.service.js';
import { RefreshCookieService } from '../security/refresh-cookie.service.js';
import { RefreshTokenService } from '../security/refresh-token.service.js';
import { AuthService } from '../service/auth.service.js';
import { InMemoryAuthRepository } from './in-memory-auth.repository.js';

const PASSWORD = 'senha-correta-123';
const COOKIE_NAME = TEST_ENV.AUTH_COOKIE_NAME;

interface ParsedCookie {
    readonly value: string;
    readonly attributes: Record<string, string | true>;
}

/** O cookie do refresh token gravado pela resposta (undefined se a resposta não mexeu nele). */
function refreshCookieOf(response: TestResponse): ParsedCookie | undefined {
    const header = response.headers['set-cookie'];

    if (!header?.startsWith(`${COOKIE_NAME}=`)) {
        return undefined;
    }

    const [pair, ...attributes] = header.split(';').map(part => part.trim());

    return {
        value: pair.slice(COOKIE_NAME.length + 1),
        attributes: Object.fromEntries(attributes.map(attribute => {
            const [key, value] = attribute.split('=');
            return [key.toLowerCase(), value ?? true];
        }))
    };
}

/*
 * Rotas /auth por HTTP com o repositório em memória: /auth/me, validação do login, logout com
 * Bearer vencido e o que acontece com o cookie quando algo falha. O fluxo completo da sessão
 * (rotação, reuso, 30 dias, CSRF, limites) fica no auth-cookie.spec.
 */
describe('rotas /auth', () => {
    let passwordHash: string;
    let repository: InMemoryAuthRepository;
    let user: User;
    let session: AuthSession;
    let api: HttpTestApp;

    beforeAll(async () => {
        passwordHash = await new PasswordService().hashPassword(PASSWORD);
    });

    const start = async (role: Role = Role.USER): Promise<void> => {
        repository = new InMemoryAuthRepository();
        user = repository.seedUser({ id: TEST_USER_ID, email: TEST_USER_EMAIL, role, hash: passwordHash });
        session = repository.seedSession({ id: TEST_SESSION_ID, userId: TEST_USER_ID });
        api = await HttpTestApp.create({ imports: [], overrides: [{ provide: AuthRepository, useValue: repository }] });
    };

    afterEach(async () => {
        jest.restoreAllMocks();
        await api.close();
    });

    /** Access token assinado como o da API, mas já vencido. */
    const expiredAccessToken = (sessionId: string): string => jwt.sign(
        { sid: sessionId, exp: Math.floor(Date.now() / 1000) - 60 },
        TEST_ENV.JWT_SECRET,
        { algorithm: 'HS256', audience: 'financas-api', issuer: TEST_ENV.JWT_ISSUER, subject: TEST_USER_ID }
    );

    const withCookie = (refreshToken: string): { headers: Record<string, string> } => ({ headers: { cookie: `${COOKIE_NAME}=${refreshToken}` } });

    const expectClearedCookie = (response: TestResponse): void => {
        expect(refreshCookieOf(response)).toMatchObject({ value: '', attributes: { 'max-age': '0', path: '/api/auth' } });
    };

    describe('GET /auth/me', () => {
        it('devolve id, e-mail e papel do usuário do token (sem o hash da senha)', async () => {
            await start();

            const response = await api.get('/auth/me');

            expect(response.status).toBe(200);
            expect(dataOf(response)).toEqual({ id: TEST_USER_ID, email: TEST_USER_EMAIL, role: Role.USER });
        });

        it('ADMIN também acessa (ADMIN passa em qualquer @Roles)', async () => {
            await start(Role.ADMIN);

            const response = await api.get('/auth/me');

            expect(response.status).toBe(200);
            expect(dataOf(response)).toMatchObject({ role: Role.ADMIN });
        });

        it('401 AUTH_UNAUTHENTICATED sem token, com outro esquema, com token vencido ou de outro segredo', async () => {
            await start();
            const otherSecret = jwt.sign({ sid: TEST_SESSION_ID }, 'outro-segredo-com-mais-de-32-caracteres!!', {
                algorithm: 'HS256', audience: 'financas-api', issuer: TEST_ENV.JWT_ISSUER, subject: TEST_USER_ID, expiresIn: '15m'
            });

            const responses = [
                await api.get('/auth/me', { auth: false }),
                await api.get('/auth/me', { auth: false, headers: { authorization: `Basic ${api.accessToken}` } }),
                await api.get('/auth/me', { auth: expiredAccessToken(TEST_SESSION_ID) }),
                await api.get('/auth/me', { auth: otherSecret })
            ];

            for (const response of responses) {
                expect(response.status).toBe(401);
                expect(errorOf(response)).toMatchObject({ code: 'AUTH_UNAUTHENTICATED', message: 'Autenticação necessária' });
            }
        });

        it('401 depois do logout (sessão encerrada) ou com o usuário desativado', async () => {
            await start();

            session.revokedAt = new Date();
            const revoked = await api.get('/auth/me');
            session.revokedAt = null;

            user.active = false;
            const inactive = await api.get('/auth/me');

            expect(revoked.status).toBe(401);
            expect(inactive.status).toBe(401);
            expect(errorOf(inactive).code).toBe('AUTH_UNAUTHENTICATED');
        });
    });

    describe('POST /auth/login', () => {
        it('aceita o e-mail com maiúsculas e espaços, devolve o access token e mostra o limite de 5 por minuto', async () => {
            await start();

            const response = await api.post('/auth/login', { email: '  PESSOA@Exemplo.com ', password: PASSWORD }, { auth: false });

            expect(response.status).toBe(200);
            expect(Object.keys(dataOf<object>(response))).toEqual(['accessToken']);
            expect(refreshCookieOf(response)?.value).toHaveLength(80);
            expect(response.headers['x-ratelimit-limit']).toBe('5');
            expect(response.headers['x-ratelimit-remaining']).toBe('4');

            const me = await api.get('/auth/me', { auth: dataOf<{ accessToken: string }>(response).accessToken });
            expect(dataOf(me)).toMatchObject({ id: TEST_USER_ID });
        });

        it('valida o corpo (400 VALIDATION_ERROR com os campos) sem gravar cookie nem sessão', async () => {
            await start();

            const missing = await api.post('/auth/login', {}, { auth: false });
            const invalidEmail = await api.post('/auth/login', { email: 'nao-e-email', password: PASSWORD }, { auth: false });
            const extra = await api.post('/auth/login', { email: TEST_USER_EMAIL, password: PASSWORD, lembrar: true }, { auth: false });

            for (const response of [missing, invalidEmail, extra]) {
                expect(response.status).toBe(400);
                expect(errorOf(response).code).toBe('VALIDATION_ERROR');
                expect(refreshCookieOf(response)).toBeUndefined();
            }

            expect(errorOf(missing).details).toEqual([
                expect.objectContaining({ field: 'email', code: 'any.required' }),
                expect.objectContaining({ field: 'password', code: 'any.required' })
            ]);
            expect(errorOf(invalidEmail).details).toEqual([expect.objectContaining({ field: 'email', code: 'string.email' })]);
            expect(errorOf(extra).details).toEqual([expect.objectContaining({ field: 'lembrar', code: 'object.unknown' })]);
            expect(repository.sessions.size).toBe(1);
        });
    });

    describe('POST /auth/refresh', () => {
        it('troca o cookie por um novo e devolve um access token que funciona', async () => {
            await start();
            const current = new RefreshTokenService().generate(TEST_SESSION_ID);
            session.tokenHash = current.tokenHash;

            const response = await api.post('/auth/refresh', undefined, { auth: false, ...withCookie(current.token) });

            expect(response.status).toBe(200);
            const cookie = refreshCookieOf(response);
            expect(cookie?.value).toHaveLength(80);
            expect(cookie?.value).not.toBe(current.token);
            expect(cookie?.attributes).toMatchObject({ httponly: true, secure: true, samesite: 'Strict', path: '/api/auth' });

            const me = await api.get('/auth/me', { auth: dataOf<{ accessToken: string }>(response).accessToken });
            expect(me.status).toBe(200);
        });

        it('cookie malformado: 401 AUTH_INVALID_SESSION e o cookie é apagado', async () => {
            await start();

            const response = await api.post('/auth/refresh', undefined, { auth: false, ...withCookie('lixo') });

            expect(response.status).toBe(401);
            expect(errorOf(response)).toMatchObject({ code: 'AUTH_INVALID_SESSION', message: 'Sessão inválida' });
            expectClearedCookie(response);
        });

        it('falha que não é de sessão (banco fora do ar): 500 e o cookie fica, para tentar de novo', async () => {
            await start();
            const current = new RefreshTokenService().generate(TEST_SESSION_ID);
            jest.spyOn(repository, 'findSessionById').mockRejectedValue(new Error('banco fora do ar'));

            const response = await api.post('/auth/refresh', undefined, { auth: false, ...withCookie(current.token) });

            expect(response.status).toBe(500);
            expect(errorOf(response).code).toBe('INTERNAL_ERROR');
            expect(refreshCookieOf(response)).toBeUndefined();
        });
    });

    describe('POST /auth/logout', () => {
        it('com Bearer vencido e cookie de outra sessão: encerra as duas, responde 204 e apaga o cookie', async () => {
            await start();
            const other = new RefreshTokenService().generate();
            const otherSession = repository.seedSession({ id: other.sessionId, userId: TEST_USER_ID, tokenHash: other.tokenHash });

            const response = await api.post('/auth/logout', undefined, { auth: expiredAccessToken(TEST_SESSION_ID), ...withCookie(other.token) });

            expect(response.status).toBe(204);
            expect(response.body).toBeUndefined();
            expectClearedCookie(response);
            expect(session.revokedAt).not.toBeNull();
            expect(otherSession.revokedAt).not.toBeNull();
        });

        it('mesmo se encerrar a sessão falhar (500), o cookie é apagado', async () => {
            await start();
            jest.spyOn(repository, 'revokeSession').mockRejectedValue(new Error('banco fora do ar'));

            const response = await api.post('/auth/logout');

            expect(response.status).toBe(500);
            expectClearedCookie(response);
        });
    });
});

describe('AuthController.me sem o JwtAuthGuard', () => {
    it('sem identidade na requisição: 401 identity_missing_after_guard, sem consultar o serviço', async () => {
        const me = jest.fn(async () => Promise.resolve({ id: 'x', email: 'x', role: Role.USER }));
        const controller = new AuthController({ me } as unknown as AuthService, {} as RefreshCookieService);

        await expect(controller.me({} as AuthenticatedRequest)).rejects.toMatchObject({
            code: 'AUTH_UNAUTHENTICATED', statusCode: 401, reason: 'identity_missing_after_guard'
        });
        expect(me).not.toHaveBeenCalled();
    });
});
