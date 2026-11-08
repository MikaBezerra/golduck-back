import type { AuthSession, User } from '../generated/prisma/client.js';
import type { ModuleMetadata } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';

import { configureApp } from '../app.setup.js';
import { Role } from '../generated/prisma/enums.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { AuthRepository } from '../modules/auth/repository/auth.repository.js';
import { AccessTokenService } from '../modules/auth/security/access-token.service.js';
import { PrismaService } from '../modules/common/index.js';
import { generateRequestId } from '../modules/common/logging/request-id.js';

/*
 * API de verdade para testes HTTP: o módulo testado + o AuthModule (guards globais), montados com o
 * mesmo configureApp do server.ts. O banco não é usado: o PrismaService vira um objeto vazio e cada
 * repositório é trocado por uma versão em memória (overrides). A API escuta numa porta livre só
 * da máquina (127.0.0.1) e as requisições vão por fetch, como as de um cliente de verdade.
 */

/** Variáveis de ambiente mínimas para a API subir nos testes (nada de .env). */
export const TEST_ENV = {
    APP_ENV: 'test',
    API_PORT: '3000',
    API_PREFIX: '/api',
    API_CORS_ORIGINS: 'https://front.test',
    SWAGGER_ENABLE: '0',
    DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste',
    JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
    JWT_ISSUER: 'testes',
    AUTH_COOKIE_NAME: 'golduck_refresh',
    AUTH_COOKIE_SAMESITE: 'strict',
    AUTH_COOKIE_DOMAIN: '',
    LOG_LEVEL: 'error'
} as const;

Object.assign(process.env, TEST_ENV);

export const TEST_USER_ID = '2f1c3c8e-6b1a-4c3e-9d2f-1a2b3c4d5e6f';
export const TEST_SESSION_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
export const TEST_USER_EMAIL = 'pessoa@exemplo.com';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do repositório real */
/** Só o que os guards usam: um usuário e uma sessão válidos. */
export class InMemoryAuthRepository {
    public readonly users = new Map<string, User>();
    public readonly sessions = new Map<string, AuthSession>();

    public constructor(role: Role = Role.USER) {
        const now = new Date();
        this.users.set(TEST_USER_ID, {
            id: TEST_USER_ID, email: TEST_USER_EMAIL, role, active: true, hash: 'nao-usado', createdAt: now, updatedAt: now
        });
        this.sessions.set(TEST_SESSION_ID, {
            id: TEST_SESSION_ID,
            userId: TEST_USER_ID,
            tokenHash: 'nao-usado',
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
            revokedAt: null,
            createdAt: now,
            updatedAt: now
        });
    }

    public async findByUserId(userId: string): Promise<User | null> {
        return this.users.get(userId) ?? null;
    }

    public async findSessionById(sessionId: string): Promise<AuthSession | null> {
        return this.sessions.get(sessionId) ?? null;
    }
}
/* eslint-enable @typescript-eslint/require-await */

export interface HttpTestAppOptions {
    /** Módulo(s) testado(s). O AuthModule entra sozinho. */
    readonly imports: NonNullable<ModuleMetadata['imports']>;
    /** Provedores trocados no teste, geralmente o repositório do módulo por um em memória. */
    readonly overrides?: ReadonlyArray<{ readonly provide: unknown; readonly useValue: unknown }>;
    /** Papel do usuário logado (padrão USER). */
    readonly role?: Role;
}

export interface TestRequestOptions {
    readonly body?: unknown;
    readonly query?: Record<string, string | number | boolean>;
    readonly headers?: Record<string, string>;
    /** true (padrão): com o token do usuário de teste; false: sem Authorization; texto: esse token. */
    readonly auth?: boolean | string;
}

export interface TestResponse {
    readonly status: number;
    /** Nomes em minúsculas. */
    readonly headers: Record<string, string>;
    /** Corpo já convertido de JSON (ou o texto, se não for JSON; undefined se vazio). */
    readonly body: unknown;
}

export class HttpTestApp {
    private constructor(
        public readonly app: NestFastifyApplication,
        public readonly authRepository: InMemoryAuthRepository,
        public readonly accessToken: string,
        private readonly baseUrl: string
    ) { }

    public static async create(options: HttpTestAppOptions): Promise<HttpTestApp> {
        const authRepository = new InMemoryAuthRepository(options.role);
        let builder = Test.createTestingModule({ imports: [AuthModule, ...options.imports] })
            .overrideProvider(PrismaService).useValue({})
            .overrideProvider(AuthRepository).useValue(authRepository);

        for (const override of options.overrides ?? []) {
            builder = builder.overrideProvider(override.provide).useValue(override.useValue);
        }

        const moduleRef = await builder.compile();
        const app = moduleRef.createNestApplication<NestFastifyApplication>(
            new FastifyAdapter({ genReqId: generateRequestId }),
            { logger: false }
        );

        await configureApp(app);
        // Porta livre qualquer, só na máquina. (O inject do Fastify não carrega no Jest em modo ESM.)
        await app.listen(0, '127.0.0.1');

        const { port } = app.getHttpServer().address() as AddressInfo;
        const accessToken = app.get(AccessTokenService).generate(TEST_USER_ID, TEST_SESSION_ID);

        return new HttpTestApp(app, authRepository, accessToken, `http://127.0.0.1:${port}`);
    }

    public async request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, options: TestRequestOptions = {}): Promise<TestResponse> {
        const auth = options.auth ?? true;
        const token = typeof auth === 'string' ? auth : auth ? this.accessToken : undefined;
        const query = options.query
            ? `?${new URLSearchParams(Object.entries(options.query).map(([key, value]) => [key, String(value)])).toString()}`
            : '';

        const response = await fetch(`${this.baseUrl}/api${path}${query}`, {
            method,
            headers: {
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                ...options.headers
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
        });

        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: parseBody(await response.text())
        };
    }

    public async get(path: string, options?: TestRequestOptions): Promise<TestResponse> {
        return this.request('GET', path, options);
    }

    public async post(path: string, body?: unknown, options?: TestRequestOptions): Promise<TestResponse> {
        return this.request('POST', path, { ...options, body });
    }

    public async patch(path: string, body?: unknown, options?: TestRequestOptions): Promise<TestResponse> {
        return this.request('PATCH', path, { ...options, body });
    }

    public async delete(path: string, options?: TestRequestOptions): Promise<TestResponse> {
        return this.request('DELETE', path, options);
    }

    public async close(): Promise<void> {
        await this.app.close();
    }
}

/** O `data` de uma resposta de sucesso (`{ data }`). */
export function dataOf<T>(response: TestResponse): T {
    return (response.body as { data: T }).data;
}

/** O `error` de uma resposta de erro (`{ error: { code, message, requestId, details? } }`). */
export function errorOf(response: TestResponse): { code: string; message: string; requestId: string; details?: unknown } {
    return (response.body as { error: { code: string; message: string; requestId: string; details?: unknown } }).error;
}

function parseBody(body: string): unknown {
    if (!body) {
        return undefined;
    }

    try {
        return JSON.parse(body) as unknown;
    } catch {
        return body;
    }
}
