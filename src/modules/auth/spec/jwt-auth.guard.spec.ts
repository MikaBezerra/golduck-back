import type { AuthSession, User } from '../../../generated/prisma/client';
import type { Config } from '../../common';
import type { AppError } from '../../common/errors/app-error';
import type { AuthenticatedRequest } from '../security/jwt-auth.guard';
import { jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';

import { Role } from '../../../generated/prisma/enums';
import { AuthRepository } from '../repository/auth.repository';
import { AccessTokenService } from '../security/access-token.service';
import { Public } from '../security/auth.decorators';
import { JwtAuthGuard, readBearerToken } from '../security/jwt-auth.guard';
import { httpContext } from './http-execution-context';
import { InMemoryAuthRepository } from './in-memory-auth.repository';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const ISSUER = 'testes';
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

/* Rotas de mentira: o guard só lê os metadados (@Public) do método e da classe. */
class PrivateController {
    @Public()
    public health(): string {
        return 'pública';
    }

    public list(): string {
        return 'privada';
    }
}

@Public()
class PublicController {
    public anything(): string {
        return 'pública';
    }
}

function requestWith(authorization?: unknown): AuthenticatedRequest {
    return { headers: authorization === undefined ? {} : { authorization } } as unknown as AuthenticatedRequest;
}

describe('readBearerToken', () => {
    const read = (authorization?: unknown): string | undefined => readBearerToken(requestWith(authorization));

    it('lê o token de "Bearer <token>", sem diferenciar maiúsculas e aceitando vários espaços', () => {
        expect(read('Bearer abc.def-ghi')).toBe('abc.def-ghi');
        expect(read('bearer abc')).toBe('abc');
        expect(read('BEARER abc')).toBe('abc');
        expect(read('Bearer    abc')).toBe('abc');
    });

    it('header ausente ou malformado devolve undefined', () => {
        for (const header of [undefined, '', 'Basic abc', 'Bearer', 'Bearer ', 'Bearerabc', 'Bearer a b', ' Bearer abc', 'xBearer abc', 'Bearer abc ', 'abc']) {
            expect(read(header)).toBeUndefined();
        }
    });

    it('ignora header que não é texto (repetido vira lista)', () => {
        expect(read(['Bearer abc', 'Bearer def'])).toBeUndefined();
    });
});

describe('JwtAuthGuard', () => {
    let repository: InMemoryAuthRepository;
    let tokens: AccessTokenService;
    let guard: JwtAuthGuard;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        repository = new InMemoryAuthRepository();
        tokens = new AccessTokenService({ JWT_SECRET: SECRET, JWT_ISSUER: ISSUER } as Config);
        guard = new JwtAuthGuard(new Reflector(), tokens, repository as unknown as AuthRepository);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** Roda o guard numa rota privada com o header Authorization dado. */
    const run = async (authorization?: string): Promise<{ allowed: boolean; request: AuthenticatedRequest }> => {
        const request = requestWith(authorization);
        const allowed = await guard.canActivate(httpContext(PrivateController, 'list', () => request));
        return { allowed, request };
    };

    const expectUnauthenticated = async (authorization: string | undefined, reason: string): Promise<void> => {
        await expect(run(authorization)).rejects.toMatchObject({
            code: 'AUTH_UNAUTHENTICATED', statusCode: 401, reason
        } satisfies Partial<AppError>);
    };

    /** Usuário ativo com uma sessão válida e o Bearer dessa sessão. */
    const loggedIn = (role: Role = Role.USER): { user: User; session: AuthSession; bearer: string } => {
        const user = repository.seedUser({ email: 'pessoa@exemplo.com', role });
        const session = repository.seedSession({ userId: user.id, expiresAt: new Date(NOW + 60_000) });
        return { user, session, bearer: `Bearer ${tokens.generate(user.id, session.id)}` };
    };

    describe('rotas @Public', () => {
        it('passam sem ler a requisição nem consultar o banco (no método)', async () => {
            const getRequest = jest.fn(() => requestWith());
            const findUser = jest.spyOn(repository, 'findByUserId');

            await expect(guard.canActivate(httpContext(PrivateController, 'health', getRequest))).resolves.toBe(true);
            expect(getRequest).not.toHaveBeenCalled();
            expect(findUser).not.toHaveBeenCalled();
        });

        it('passam quando o @Public está no controller', async () => {
            const getRequest = jest.fn(() => requestWith());

            await expect(guard.canActivate(httpContext(PublicController, 'anything', getRequest))).resolves.toBe(true);
            expect(getRequest).not.toHaveBeenCalled();
        });
    });

    it('sem Authorization ou com header malformado: 401 bearer_missing_or_malformed, sem consultar o banco', async () => {
        const findUser = jest.spyOn(repository, 'findByUserId');
        const { bearer } = loggedIn();

        for (const header of [undefined, 'Basic dXNlcjpzZW5oYQ==', 'Bearer', bearer.replace('Bearer ', '')]) {
            await expectUnauthenticated(header, 'bearer_missing_or_malformed');
        }

        expect(findUser).not.toHaveBeenCalled();
    });

    it('token inválido, de outro segredo ou vencido: 401 access_token_invalid', async () => {
        const { user, session } = loggedIn();
        const otherSecret = jwt.sign({ sid: session.id }, 'outro-segredo-com-mais-de-32-caracteres!!', {
            algorithm: 'HS256', audience: 'financas-api', issuer: ISSUER, subject: user.id, expiresIn: '15m'
        });
        const expired = jwt.sign({ sid: session.id, exp: Math.floor(NOW / 1000) - 1 }, SECRET, {
            algorithm: 'HS256', audience: 'financas-api', issuer: ISSUER, subject: user.id
        });

        for (const token of ['nao-e-um-jwt', otherSecret, expired]) {
            await expectUnauthenticated(`Bearer ${token}`, 'access_token_invalid');
        }
    });

    it('usuário inexistente ou inativo: 401 user_missing_or_inactive', async () => {
        const { user, bearer } = loggedIn();

        user.active = false;
        await expectUnauthenticated(bearer, 'user_missing_or_inactive');

        repository.users.delete(user.id);
        await expectUnauthenticated(bearer, 'user_missing_or_inactive');
    });

    it('sessão inexistente: 401 session_missing_revoked_or_expired', async () => {
        const { session, bearer } = loggedIn();
        repository.sessions.delete(session.id);

        await expectUnauthenticated(bearer, 'session_missing_revoked_or_expired');
    });

    it('sessão de outro usuário não vale com o token deste', async () => {
        const { bearer } = loggedIn();
        const other = repository.seedUser({ email: 'outra@exemplo.com' });
        const othersSession = repository.seedSession({ userId: other.id, expiresAt: new Date(NOW + 60_000) });
        const { user } = loggedIn();

        // Token assinado para este usuário, apontando para a sessão de outra pessoa.
        await expectUnauthenticated(`Bearer ${tokens.generate(user.id, othersSession.id)}`, 'session_missing_revoked_or_expired');
        await expect(run(bearer)).resolves.toMatchObject({ allowed: true });
    });

    it('sessão encerrada (logout) não vale mais, mesmo com o token ainda no prazo', async () => {
        const { session, bearer } = loggedIn();
        session.revokedAt = new Date(NOW - 1000);

        await expectUnauthenticated(bearer, 'session_missing_revoked_or_expired');
    });

    it('sessão vence no instante exato do expiresAt; 1 ms antes ainda vale', async () => {
        const { session, bearer } = loggedIn();

        session.expiresAt = new Date(NOW);
        await expectUnauthenticated(bearer, 'session_missing_revoked_or_expired');

        session.expiresAt = new Date(NOW + 1);
        await expect(run(bearer)).resolves.toMatchObject({ allowed: true });
    });

    it('token válido: grava a identidade (id, e-mail, sessão e papel) na requisição', async () => {
        const { user, session, bearer } = loggedIn(Role.ADMIN);

        const { allowed, request } = await run(bearer);

        expect(allowed).toBe(true);
        expect(request.auth).toEqual({ userId: user.id, email: 'pessoa@exemplo.com', sessionId: session.id, role: Role.ADMIN });
    });

    it('aceita "bearer" em minúsculas', async () => {
        const { user, bearer } = loggedIn();

        const { request } = await run(bearer.replace('Bearer', 'bearer'));

        expect(request.auth?.userId).toBe(user.id);
    });
});
