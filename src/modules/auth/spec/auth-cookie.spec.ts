import type { AuthSession, User } from '../../../generated/prisma/client';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';

import { configureApp } from '../../../app.setup';
import { Role } from '../../../generated/prisma/enums';
import { PrismaService } from '../../common';
import { generateRequestId } from '../../common/logging/request-id';
import { AuthModule } from '../auth.module';
import { AuthRepository } from '../repository/auth.repository';
import { PasswordService } from '../security/password.service';

/*
 * Fluxo da sessão por HTTP de verdade (fetch numa porta local), com a API montada como em produção
 * (configureApp) e um repositório em memória no lugar do banco.
 */

const COOKIE_NAME = 'golduck_refresh';
const FRONT_ORIGIN = 'https://front.test';
const JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const JWT_ISSUER = 'testes';
const EMAIL = 'pessoa@exemplo.com';
const PASSWORD = 'senha-correta-123';
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

Object.assign(process.env, {
    API_PORT: '3000',
    API_PREFIX: '/api',
    API_CORS_ORIGINS: FRONT_ORIGIN,
    SWAGGER_ENABLE: '0',
    DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste',
    JWT_SECRET,
    JWT_ISSUER,
    AUTH_COOKIE_NAME: COOKIE_NAME,
    AUTH_COOKIE_SAMESITE: 'strict',
    AUTH_COOKIE_DOMAIN: ''
});

/* eslint-disable @typescript-eslint/require-await -- o repositório em memória imita a interface assíncrona do Prisma */
class InMemoryAuthRepository {
    public readonly users = new Map<string, User>();
    public readonly sessions = new Map<string, AuthSession>();

    public async findUserByEmail(email: string): Promise<User | null> {
        const normalized = email.trim().toLowerCase();
        return [...this.users.values()].find(user => user.email === normalized) ?? null;
    }

    public async findByUserId(userId: string): Promise<User | null> {
        return this.users.get(userId) ?? null;
    }

    public async createSession(sessionId: string, userId: string, tokenHash: string, expiresAt: Date): Promise<AuthSession> {
        const now = new Date();
        const session: AuthSession = { id: sessionId, userId, tokenHash, expiresAt, revokedAt: null, createdAt: now, updatedAt: now };
        this.sessions.set(sessionId, session);
        return session;
    }

    public async findSessionById(sessionId: string): Promise<AuthSession | null> {
        return this.sessions.get(sessionId) ?? null;
    }

    public async rotateSession(sessionId: string, currentTokenHash: string, nextTokenHash: string, nextExpiresAt: Date): Promise<boolean> {
        const session = this.sessions.get(sessionId);

        if (!session || session.tokenHash !== currentTokenHash || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
            return false;
        }

        session.tokenHash = nextTokenHash;
        session.expiresAt = nextExpiresAt;
        return true;
    }

    public async revokeSession(sessionId: string, userId: string): Promise<void> {
        const session = this.sessions.get(sessionId);

        if (session && session.userId === userId && session.revokedAt === null) {
            session.revokedAt = new Date();
        }
    }
}
/* eslint-enable @typescript-eslint/require-await */

/** PasswordService real, contando quantas comparações de senha (Argon2) foram feitas. */
class CountingPasswordService extends PasswordService {
    public verifications = 0;

    public override async verifyPassword(password: string, storedHash: string): Promise<boolean> {
        this.verifications++;
        return super.verifyPassword(password, storedHash);
    }
}

interface ParsedCookie {
    name: string;
    value: string;
    attributes: Record<string, string | true>;
}

/** Lê os Set-Cookie da resposta: nome, valor e atributos (chaves em minúsculas). */
function parseSetCookies(response: Response): ParsedCookie[] {
    return response.headers.getSetCookie().map(header => {
        const [pair, ...attributes] = header.split(';').map(part => part.trim());
        const separator = pair.indexOf('=');

        return {
            name: pair.slice(0, separator),
            value: pair.slice(separator + 1),
            attributes: Object.fromEntries(attributes.map(attribute => {
                const [key, value] = attribute.split('=');
                return [key.toLowerCase(), value ?? true];
            }))
        };
    });
}

describe('sessão com refresh token em cookie httpOnly', () => {
    let passwordHash: string;
    let repository: InMemoryAuthRepository;
    let passwords: CountingPasswordService;
    let app: NestFastifyApplication;
    let baseUrl: string;

    beforeAll(async () => {
        passwordHash = await new PasswordService().hashPassword(PASSWORD);
    });

    beforeEach(async () => {
        repository = new InMemoryAuthRepository();
        const now = new Date();
        repository.users.set('user-1', {
            id: 'user-1', email: EMAIL, role: Role.USER, active: true, hash: passwordHash, createdAt: now, updatedAt: now
        });

        passwords = new CountingPasswordService();

        const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
            .overrideProvider(PrismaService).useValue({})
            .overrideProvider(AuthRepository).useValue(repository)
            .overrideProvider(PasswordService).useValue(passwords)
            .compile();

        // trustProxy deixa os testes simularem vários IPs pelo X-Forwarded-For (sem ele, o IP é 127.0.0.1).
        app = moduleRef.createNestApplication<NestFastifyApplication>(
            new FastifyAdapter({ genReqId: generateRequestId, trustProxy: true }),
            { logger: false }
        );
        await configureApp(app);
        await app.listen(0, '127.0.0.1');

        const { port } = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
        await app.close();
    });

    const post = async (
        path: string,
        options: { cookie?: string; origin?: string | null; headers?: Record<string, string>; payload?: object } = {}
    ): Promise<Response> => fetch(`${baseUrl}/api/auth/${path}`, {
        method: 'POST',
        headers: {
            ...(options.origin === null ? {} : { origin: options.origin ?? FRONT_ORIGIN }),
            ...(options.cookie ? { cookie: `${COOKIE_NAME}=${options.cookie}` } : {}),
            ...(options.payload ? { 'content-type': 'application/json' } : {}),
            ...options.headers
        },
        ...(options.payload ? { body: JSON.stringify(options.payload) } : {})
    });

    const sessionCookie = (response: Response): ParsedCookie | undefined =>
        parseSetCookies(response).find(cookie => cookie.name === COOKIE_NAME);

    const errorCode = async (response: Response): Promise<string> =>
        ((await response.json()) as { error: { code: string } }).error.code;

    /** Login vindo de um IP específico (para não esbarrar no limite de 5 por minuto por IP). */
    const loginFrom = async (ip: string, email: string, password: string): Promise<Response> =>
        post('login', { payload: { email, password }, headers: { 'x-forwarded-for': ip } });

    const onlySession = (): AuthSession => [...repository.sessions.values()][0];

    const login = async (): Promise<{ accessToken: string; refreshToken: string }> => {
        const response = await post('login', { payload: { email: EMAIL, password: PASSWORD } });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { accessToken: string } };

        return { accessToken: body.data.accessToken, refreshToken: sessionCookie(response)?.value ?? '' };
    };

    const expectClearedCookie = (response: Response): void => {
        const cookie = sessionCookie(response);
        expect(cookie?.value).toBe('');
        expect(cookie?.attributes['max-age']).toBe('0');
        expect(cookie?.attributes.path).toBe('/api/auth');
    };

    it('login grava o refresh token no cookie httpOnly e devolve só o access token', async () => {
        const response = await post('login', { payload: { email: EMAIL, password: PASSWORD } });

        expect(response.status).toBe(200);
        expect(Object.keys(((await response.json()) as { data: object }).data)).toEqual(['accessToken']);

        const cookie = sessionCookie(response);
        expect(cookie?.value).toHaveLength(80);
        expect(cookie?.attributes).toMatchObject({
            httponly: true,
            secure: true,
            samesite: 'Strict',
            path: '/api/auth',
            'max-age': String(SEVEN_DAYS_IN_SECONDS)
        });
        expect(repository.sessions.size).toBe(1);
    });

    it('login com senha errada não grava cookie', async () => {
        const response = await post('login', { payload: { email: EMAIL, password: 'senha-errada' } });

        expect(response.status).toBe(401);
        expect(sessionCookie(response)).toBeUndefined();
    });

    it('refresh gira o cookie, aceita JSON sem corpo e detecta o reuso do cookie antigo', async () => {
        const first = await login();

        const rotated = await post('refresh', { cookie: first.refreshToken, headers: { 'content-type': 'application/json' } });
        expect(rotated.status).toBe(200);
        expect(((await rotated.json()) as { data: { accessToken: string } }).data.accessToken).toEqual(expect.any(String));

        const second = sessionCookie(rotated)?.value ?? '';
        expect(second).toHaveLength(80);
        expect(second).not.toBe(first.refreshToken);

        // Reusar o cookie antigo indica roubo: encerra a sessão e apaga o cookie.
        const reused = await post('refresh', { cookie: first.refreshToken });
        expect(reused.status).toBe(401);
        expect(await errorCode(reused)).toBe('AUTH_INVALID_SESSION');
        expectClearedCookie(reused);

        // Até o cookie novo deixa de valer, porque a sessão foi encerrada.
        expect((await post('refresh', { cookie: second })).status).toBe(401);
    });

    it('refresh sem cookie responde 401 AUTH_INVALID_SESSION e apaga o cookie', async () => {
        const response = await post('refresh');

        expect(response.status).toBe(401);
        expect(await errorCode(response)).toBe('AUTH_INVALID_SESSION');
        expectClearedCookie(response);
    });

    it('logout encerra a sessão do cookie e apaga o cookie', async () => {
        const session = await login();

        const response = await post('logout', { cookie: session.refreshToken });
        expect(response.status).toBe(204);
        expectClearedCookie(response);

        expect((await post('refresh', { cookie: session.refreshToken })).status).toBe(401);
    });

    it('logout funciona só com o access token vencido', async () => {
        const session = await login();
        const claims = jwt.decode(session.accessToken) as jwt.JwtPayload;
        const expired = jwt.sign(
            { sid: claims.sid as string, exp: Math.floor(Date.now() / 1000) - 60 },
            JWT_SECRET,
            { algorithm: 'HS256', audience: claims.aud as string, issuer: JWT_ISSUER, subject: claims.sub }
        );

        const response = await post('logout', { headers: { authorization: `Bearer ${expired}` } });
        expect(response.status).toBe(204);

        expect((await post('refresh', { cookie: session.refreshToken })).status).toBe(401);
    });

    it('logout sem cookie nem token também responde 204 e apaga o cookie', async () => {
        const response = await post('logout');

        expect(response.status).toBe(204);
        expectClearedCookie(response);
    });

    it('logout com cookie forjado (id de sessão certo, segredo inventado) responde 204, mas não encerra a sessão', async () => {
        const session = await login();
        const forged = `${session.refreshToken.split('.')[0]}.${'A'.repeat(43)}`;

        const response = await post('logout', { cookie: forged });
        expect(response.status).toBe(204);
        expectClearedCookie(response);

        expect((await post('refresh', { cookie: session.refreshToken })).status).toBe(200);
    });

    it('login, refresh e logout recusam origem estranha com 403 FORBIDDEN', async () => {
        const session = await login();

        for (const path of ['login', 'refresh', 'logout']) {
            const response = await post(path, {
                origin: 'https://site-malicioso.test',
                cookie: session.refreshToken,
                payload: path === 'login' ? { email: EMAIL, password: PASSWORD } : undefined
            });

            expect(response.status).toBe(403);
            expect(await errorCode(response)).toBe('FORBIDDEN');
            expect(sessionCookie(response)).toBeUndefined();
        }

        // Nada foi alterado: o cookie original continua valendo.
        expect((await post('refresh', { cookie: session.refreshToken })).status).toBe(200);
    });

    it('aceita o front, a própria API (mesma origem) e chamadas sem Origin', async () => {
        for (const origin of [FRONT_ORIGIN, baseUrl, null]) {
            expect((await post('refresh', { origin })).status).toBe(401);
        }
    });

    it('CORS libera o front com credenciais e os headers combinados', async () => {
        const response = await fetch(`${baseUrl}/api/auth/refresh`, {
            method: 'OPTIONS',
            headers: {
                origin: FRONT_ORIGIN,
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type,x-request-id,authorization'
            }
        });

        expect(response.headers.get('access-control-allow-origin')).toBe(FRONT_ORIGIN);
        expect(response.headers.get('access-control-allow-credentials')).toBe('true');
        expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toEqual(expect.stringContaining('x-request-id'));
    });

    it('e-mail inexistente também passa pela comparação de senha (tempo de resposta igual)', async () => {
        const unknown = await post('login', { payload: { email: 'ninguem@exemplo.com', password: PASSWORD } });
        expect(unknown.status).toBe(401);
        expect(passwords.verifications).toBe(1);

        const wrongPassword = await post('login', { payload: { email: EMAIL, password: 'senha-errada' } });
        expect(wrongPassword.status).toBe(401);
        expect(passwords.verifications).toBe(2);

        // A mesma resposta nos dois casos.
        expect(await errorCode(unknown)).toBe('AUTH_INVALID_CREDENTIALS');
        expect(await errorCode(wrongPassword)).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('trava o e-mail após 10 erros, mesmo vindos de IPs diferentes', async () => {
        for (let attempt = 1; attempt <= 10; attempt++) {
            expect((await loginFrom(`10.0.0.${attempt}`, EMAIL, 'senha-errada')).status).toBe(401);
        }

        const verificationsBefore = passwords.verifications;
        const locked = await loginFrom('10.0.1.1', EMAIL, PASSWORD);

        expect(locked.status).toBe(429);
        expect(await errorCode(locked)).toBe('TOO_MANY_REQUESTS');
        expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(Number(locked.headers.get('retry-after'))).toBeLessThanOrEqual(15 * 60);
        expect(sessionCookie(locked)).toBeUndefined();
        // Travado, nem compara a senha.
        expect(passwords.verifications).toBe(verificationsBefore);

        // Outro e-mail segue normal.
        expect((await loginFrom('10.0.1.2', 'outra@exemplo.com', PASSWORD)).status).toBe(401);
    });

    it('login certo zera os erros do e-mail', async () => {
        for (const round of [1, 2]) {
            for (let attempt = 1; attempt <= 9; attempt++) {
                expect((await loginFrom(`10.${round}.0.${attempt}`, EMAIL, 'senha-errada')).status).toBe(401);
            }

            expect((await loginFrom(`10.${round}.1.1`, EMAIL, PASSWORD)).status).toBe(200);
        }
    });

    it('a renovação não passa de 30 dias desde o login', async () => {
        const session = await login();
        onlySession().createdAt = new Date(Date.now() - 29 * ONE_DAY_MS);

        const nearLimit = await post('refresh', { cookie: session.refreshToken });
        expect(nearLimit.status).toBe(200);

        // Resta 1 dia: o cookie novo vale só isso, e não mais 7 dias.
        const maxAge = Number(sessionCookie(nearLimit)?.attributes['max-age']);
        expect(maxAge).toBeGreaterThan(ONE_DAY_MS / 1000 - 60);
        expect(maxAge).toBeLessThanOrEqual(ONE_DAY_MS / 1000);
    });

    it('sessão com mais de 30 dias exige senha de novo', async () => {
        const session = await login();
        onlySession().createdAt = new Date(Date.now() - 31 * ONE_DAY_MS);

        const response = await post('refresh', { cookie: session.refreshToken });

        expect(response.status).toBe(401);
        expect(await errorCode(response)).toBe('AUTH_INVALID_SESSION');
        expectClearedCookie(response);
        expect(onlySession().revokedAt).not.toBeNull();
    });

    it('refresh mantém o limite de 20 por minuto, com 429 e Retry-After', async () => {
        const statuses: number[] = [];
        let last: Response | undefined;

        for (let attempt = 0; attempt < 21; attempt++) {
            last = await post('refresh');
            statuses.push(last.status);
        }

        expect(statuses.slice(0, 20).every(status => status === 401)).toBe(true);
        expect(last?.status).toBe(429);
        expect(last ? await errorCode(last) : '').toBe('TOO_MANY_REQUESTS');
        expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
    });
});
