import type { AuthSession, User } from '../../../generated/prisma/client';
import type { Config } from '../../common';
import type { AppError } from '../../common/errors/app-error';
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';

import { Role } from '../../../generated/prisma/enums';
import { RateLimitStore } from '../../common/security';
import { AuthRepository } from '../repository/auth.repository';
import { AccessTokenService } from '../security/access-token.service';
import { LoginAttemptsService } from '../security/login-attempts.service';
import { PasswordService } from '../security/password.service';
import { REFRESH_TOKEN_TTL_MS, RefreshTokenService, SESSION_MAX_AGE_MS } from '../security/refresh-token.service';
import { AuthService } from '../service/auth.service';
import { InMemoryAuthRepository } from './in-memory-auth.repository';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL = 'pessoa@exemplo.com';
const PASSWORD = 'senha-correta-123';
const FAILURES_KEY = `login-failures ${EMAIL}`;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Senhas sem Argon2 (rápido): o "hash" guardado é "hash:<senha>". */
class FakePasswordService {
    public readonly verifyPassword = jest.fn(async (password: string, storedHash: string): Promise<boolean> =>
        Promise.resolve(storedHash === `hash:${password}`));

    public readonly verifyAgainstDummy = jest.fn(async (): Promise<false> => Promise.resolve(false));
}

/** Regras de login, renovação e logout, com o repositório em memória no lugar do banco. */
describe('AuthService', () => {
    let repository: InMemoryAuthRepository;
    let passwords: FakePasswordService;
    let refreshTokens: RefreshTokenService;
    let accessTokens: AccessTokenService;
    let store: RateLimitStore;
    let service: AuthService;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        repository = new InMemoryAuthRepository();
        passwords = new FakePasswordService();
        refreshTokens = new RefreshTokenService();
        accessTokens = new AccessTokenService({ JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres', JWT_ISSUER: 'testes' } as Config);
        store = new RateLimitStore();
        service = new AuthService(
            repository as unknown as AuthRepository,
            passwords as unknown as PasswordService,
            refreshTokens,
            accessTokens,
            new LoginAttemptsService(store)
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    const failuresOf = (): number | undefined => store.peek(FAILURES_KEY, NOW)?.count;

    describe('login', () => {
        let user: User;

        beforeEach(() => {
            user = repository.seedUser({ email: EMAIL, hash: `hash:${PASSWORD}` });
        });

        it('senha certa abre uma sessão de 7 dias e devolve access token e refresh token dessa sessão', async () => {
            const tokens = await service.login(EMAIL, PASSWORD);

            const sessions = [...repository.sessions.values()];
            expect(sessions).toHaveLength(1);
            expect(sessions[0]).toMatchObject({
                userId: user.id,
                tokenHash: sha256(tokens.refreshToken),
                expiresAt: new Date(NOW + REFRESH_TOKEN_TTL_MS),
                revokedAt: null
            });
            expect(tokens.refreshExpiresAt).toEqual(new Date(NOW + REFRESH_TOKEN_TTL_MS));
            expect(refreshTokens.parse(tokens.refreshToken)?.sessionId).toBe(sessions[0].id);
            expect(accessTokens.verify(tokens.accessToken)).toEqual({ userId: user.id, sessionId: sessions[0].id });
            expect(passwords.verifyPassword).toHaveBeenCalledWith(PASSWORD, `hash:${PASSWORD}`);
            expect(passwords.verifyAgainstDummy).not.toHaveBeenCalled();
        });

        it('acertar a senha zera os erros anteriores do e-mail', async () => {
            for (let attempt = 0; attempt < 9; attempt++) {
                await expect(service.login(EMAIL, 'senha-errada')).rejects.toBeDefined();
            }
            expect(failuresOf()).toBe(9);

            await service.login(EMAIL, PASSWORD);

            expect(failuresOf()).toBeUndefined();
        });

        it('senha errada: 401 password_mismatch, conta um erro e não abre sessão', async () => {
            await expectAppError(service.login(EMAIL, 'senha-errada'), {
                code: 'AUTH_INVALID_CREDENTIALS', statusCode: 401, reason: 'password_mismatch'
            });

            expect(failuresOf()).toBe(1);
            expect(repository.sessions.size).toBe(0);
        });

        it('e-mail sem conta: compara com o hash de mentira (mesmo tempo) e responde igual a senha errada', async () => {
            await expectAppError(service.login('ninguem@exemplo.com', PASSWORD), {
                code: 'AUTH_INVALID_CREDENTIALS', statusCode: 401, reason: 'user_missing_or_inactive'
            });

            expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith(PASSWORD);
            expect(passwords.verifyPassword).not.toHaveBeenCalled();
            expect(store.peek('login-failures ninguem@exemplo.com', NOW)?.count).toBe(1);
        });

        it('usuário inativo não entra nem com a senha certa (e a senha é comparada mesmo assim)', async () => {
            user.active = false;

            await expectAppError(service.login(EMAIL, PASSWORD), {
                code: 'AUTH_INVALID_CREDENTIALS', statusCode: 401, reason: 'user_missing_or_inactive'
            });

            expect(passwords.verifyPassword).toHaveBeenCalledWith(PASSWORD, `hash:${PASSWORD}`);
            expect(failuresOf()).toBe(1);
            expect(repository.sessions.size).toBe(0);
        });

        it('e-mail travado (10 erros): 429 antes de consultar o banco e de comparar a senha', async () => {
            for (let attempt = 0; attempt < 10; attempt++) {
                store.hit(FAILURES_KEY, 15 * 60 * 1000, NOW);
            }
            const findUser = jest.spyOn(repository, 'findUserByEmail');

            await expect(service.login(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS', statusCode: 429 });

            expect(findUser).not.toHaveBeenCalled();
            expect(passwords.verifyPassword).not.toHaveBeenCalled();
            expect(repository.sessions.size).toBe(0);
        });
    });

    describe('newRefresh', () => {
        /** Usuário com uma sessão aberta e o refresh token atual dela. */
        const openSession = (session: Partial<AuthSession> = {}): { user: User; session: AuthSession; token: string } => {
            const user = repository.seedUser({ email: EMAIL });
            const generated = refreshTokens.generate();
            const created = repository.seedSession({
                id: generated.sessionId,
                userId: user.id,
                tokenHash: generated.tokenHash,
                expiresAt: new Date(NOW + 60 * 60 * 1000),
                createdAt: new Date(NOW - ONE_DAY_MS),
                ...session
            });
            return { user, session: created, token: generated.token };
        };

        it('gira o token: mesma sessão, hash novo e mais 7 dias de validade', async () => {
            const { user, session, token } = openSession();
            const rotate = jest.spyOn(repository, 'rotateSession');

            const tokens = await service.newRefresh(token);

            expect(tokens.refreshToken).not.toBe(token);
            expect(refreshTokens.parse(tokens.refreshToken)?.sessionId).toBe(session.id);
            expect(rotate).toHaveBeenCalledWith(session.id, sha256(token), sha256(tokens.refreshToken), new Date(NOW + REFRESH_TOKEN_TTL_MS));
            expect(session.tokenHash).toBe(sha256(tokens.refreshToken));
            expect(session.expiresAt).toEqual(new Date(NOW + REFRESH_TOKEN_TTL_MS));
            expect(tokens.refreshExpiresAt).toEqual(new Date(NOW + REFRESH_TOKEN_TTL_MS));
            expect(accessTokens.verify(tokens.accessToken)).toEqual({ userId: user.id, sessionId: session.id });
        });

        it('token malformado: 401 refresh_malformed, sem consultar o banco', async () => {
            const findSession = jest.spyOn(repository, 'findSessionById');

            await expectAppError(service.newRefresh('nao-e-um-refresh-token'), {
                code: 'AUTH_INVALID_SESSION', statusCode: 401, reason: 'refresh_malformed'
            });
            expect(findSession).not.toHaveBeenCalled();
        });

        it('sessão inexistente, encerrada ou vencida: 401 session_missing_revoked_or_expired', async () => {
            const missing = refreshTokens.generate().token;
            const revoked = openSession({ revokedAt: new Date(NOW - 1000) });
            const expired = openSession({ expiresAt: new Date(NOW) });

            for (const token of [missing, revoked.token, expired.token]) {
                await expectAppError(service.newRefresh(token), {
                    code: 'AUTH_INVALID_SESSION', statusCode: 401, reason: 'session_missing_revoked_or_expired'
                });
            }
        });

        it('sessão que vence 1 ms depois de agora ainda renova', async () => {
            const { token } = openSession({ expiresAt: new Date(NOW + 1) });

            await expect(service.newRefresh(token)).resolves.toMatchObject({ refreshExpiresAt: new Date(NOW + REFRESH_TOKEN_TTL_MS) });
        });

        it('usuário apagado ou inativo: 401 user_missing_or_inactive, sem girar a sessão', async () => {
            const inactive = openSession();
            inactive.user.active = false;
            const deleted = openSession();
            repository.users.delete(deleted.user.id);
            const rotate = jest.spyOn(repository, 'rotateSession');

            for (const token of [inactive.token, deleted.token]) {
                await expectAppError(service.newRefresh(token), {
                    code: 'AUTH_INVALID_SESSION', statusCode: 401, reason: 'user_missing_or_inactive'
                });
            }
            expect(rotate).not.toHaveBeenCalled();
        });

        it('a validade nova nunca passa de 30 dias desde o login', async () => {
            const nearLimit = openSession({ createdAt: new Date(NOW - 29 * ONE_DAY_MS) });
            const farFromLimit = openSession({ createdAt: new Date(NOW - 22 * ONE_DAY_MS) });

            await expect(service.newRefresh(nearLimit.token)).resolves.toMatchObject({
                refreshExpiresAt: new Date(NOW - 29 * ONE_DAY_MS + SESSION_MAX_AGE_MS)
            });
            await expect(service.newRefresh(farFromLimit.token)).resolves.toMatchObject({
                refreshExpiresAt: new Date(NOW + REFRESH_TOKEN_TTL_MS)
            });
            expect(nearLimit.session.expiresAt).toEqual(new Date(NOW + ONE_DAY_MS));
        });

        it('com 30 dias completos desde o login, encerra a sessão e exige senha (session_max_age_reached)', async () => {
            const { user, session, token } = openSession({ createdAt: new Date(NOW - SESSION_MAX_AGE_MS) });
            const revoke = jest.spyOn(repository, 'revokeSession');
            const rotate = jest.spyOn(repository, 'rotateSession');

            await expectAppError(service.newRefresh(token), {
                code: 'AUTH_INVALID_SESSION', statusCode: 401, reason: 'session_max_age_reached'
            });

            expect(revoke).toHaveBeenCalledWith(session.id, user.id);
            expect(session.revokedAt).not.toBeNull();
            expect(rotate).not.toHaveBeenCalled();
        });

        it('1 ms antes dos 30 dias ainda renova, até o limite exato', async () => {
            const { token } = openSession({ createdAt: new Date(NOW - SESSION_MAX_AGE_MS + 1) });

            await expect(service.newRefresh(token)).resolves.toMatchObject({ refreshExpiresAt: new Date(NOW + 1) });
        });

        it('reuso de um token já girado (roubo ou corrida): encerra a sessão e responde refresh_reuse_or_race', async () => {
            const { user, session, token } = openSession();
            const rotated = await service.newRefresh(token);
            const revoke = jest.spyOn(repository, 'revokeSession');

            await expectAppError(service.newRefresh(token), {
                code: 'AUTH_INVALID_SESSION', statusCode: 401, reason: 'refresh_reuse_or_race'
            });

            expect(revoke).toHaveBeenCalledWith(session.id, user.id);
            expect(session.revokedAt).not.toBeNull();
            // Nem o token novo vale mais.
            await expectAppError(service.newRefresh(rotated.refreshToken), {
                code: 'AUTH_INVALID_SESSION', statusCode: 401, reason: 'session_missing_revoked_or_expired'
            });
        });
    });

    describe('logout', () => {
        const openSession = (): { user: User; session: AuthSession; refreshToken: string; accessToken: string } => {
            const user = repository.seedUser({ email: EMAIL });
            const generated = refreshTokens.generate();
            const session = repository.seedSession({ id: generated.sessionId, userId: user.id, tokenHash: generated.tokenHash });
            return { user, session, refreshToken: generated.token, accessToken: accessTokens.generate(user.id, session.id) };
        };

        it('encerra a sessão do cookie (refresh token)', async () => {
            const { user, session, refreshToken } = openSession();
            const revoke = jest.spyOn(repository, 'revokeSession');

            await service.logout({ refreshToken });

            expect(revoke).toHaveBeenCalledTimes(1);
            expect(revoke).toHaveBeenCalledWith(session.id, user.id);
            expect(session.revokedAt).not.toBeNull();
        });

        it('encerra a sessão do Bearer mesmo com o access token vencido', async () => {
            const { user, session, accessToken } = openSession();
            const verify = jest.spyOn(accessTokens, 'verify');
            const revoke = jest.spyOn(repository, 'revokeSession');
            jest.spyOn(Date, 'now').mockReturnValue(NOW + ONE_DAY_MS);

            await service.logout({ accessToken });

            expect(verify).toHaveBeenCalledWith(accessToken, { ignoreExpiration: true });
            expect(revoke).toHaveBeenCalledWith(session.id, user.id);
        });

        it('cookie e Bearer da mesma sessão: encerra uma vez só', async () => {
            const { refreshToken, accessToken } = openSession();
            const revoke = jest.spyOn(repository, 'revokeSession');

            await service.logout({ refreshToken, accessToken });

            expect(revoke).toHaveBeenCalledTimes(1);
        });

        it('cookie e Bearer de sessões diferentes: encerra as duas', async () => {
            const first = openSession();
            const second = openSession();

            await service.logout({ refreshToken: first.refreshToken, accessToken: second.accessToken });

            expect(first.session.revokedAt).not.toBeNull();
            expect(second.session.revokedAt).not.toBeNull();
        });

        it('cookie malformado ou de sessão que não existe e Bearer forjado: não encerra nada e não falha', async () => {
            const { session } = openSession();
            const findSession = jest.spyOn(repository, 'findSessionById');
            const revoke = jest.spyOn(repository, 'revokeSession');

            await service.logout({ refreshToken: 'lixo', accessToken: 'nao-e-um-jwt' });
            expect(findSession).not.toHaveBeenCalled();

            await service.logout({ refreshToken: refreshTokens.generate().token });
            expect(findSession).toHaveBeenCalledTimes(1);

            expect(revoke).not.toHaveBeenCalled();
            expect(session.revokedAt).toBeNull();
        });

        it('cookie com o id de uma sessão e um segredo que não é o dela: não encerra a sessão e não falha', async () => {
            const { session } = openSession();
            const revoke = jest.spyOn(repository, 'revokeSession');

            await service.logout({ refreshToken: refreshTokens.generate(session.id).token });

            expect(revoke).not.toHaveBeenCalled();
            expect(session.revokedAt).toBeNull();
        });

        it('sem cookie nem Bearer (ou vazios): não consulta nada', async () => {
            const parse = jest.spyOn(refreshTokens, 'parse');
            const verify = jest.spyOn(accessTokens, 'verify');
            const revoke = jest.spyOn(repository, 'revokeSession');

            await service.logout({});
            await service.logout({ refreshToken: '', accessToken: '' });

            expect(parse).not.toHaveBeenCalled();
            expect(verify).not.toHaveBeenCalled();
            expect(revoke).not.toHaveBeenCalled();
        });
    });

    describe('me', () => {
        it('devolve só id, e-mail e papel (nunca o hash da senha)', async () => {
            const user = repository.seedUser({ email: EMAIL, role: Role.ADMIN, hash: 'hash-secreto' });

            await expect(service.me(user.id)).resolves.toStrictEqual({ id: user.id, email: EMAIL, role: Role.ADMIN });
        });

        it('usuário apagado ou inativo: 401 user_missing_or_inactive', async () => {
            const inactive = repository.seedUser({ email: EMAIL, active: false });

            for (const userId of [inactive.id, '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f']) {
                await expectAppError(service.me(userId), {
                    code: 'AUTH_UNAUTHENTICATED', statusCode: 401, reason: 'user_missing_or_inactive'
                });
            }
        });
    });
});
