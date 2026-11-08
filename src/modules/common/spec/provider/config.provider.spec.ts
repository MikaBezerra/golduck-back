import type { Config } from '../../model/index.js';
import { Test } from '@nestjs/testing';

import { Service } from '../../../tokens.js';
import { CommonModule } from '../../common.module.js';
import { configProvider } from '../../provider/config.provider.js';
import { PrismaService } from '../../provider/prisma.provider.js';

/** Só as obrigatórias, com valores válidos. */
const REQUIRED_ENV = {
    API_PORT: '3000',
    API_PREFIX: '/api',
    DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste',
    JWT_SECRET: 'x'.repeat(32),
    JWT_ISSUER: 'testes'
} as const;

/*
 * A configuração é validada quando a fábrica roda (ao montar o módulo). O process.env é trocado em
 * cada teste e restaurado no fim, para não afetar os outros testes.
 */
describe('configProvider', () => {
    const originalEnv = process.env;

    const load = (env: Record<string, string | undefined> = {}): Config => {
        process.env = { ...REQUIRED_ENV, ...env };
        return configProvider.useFactory();
    };

    const expectInvalid = (env: Record<string, string | undefined>, message: string): void => {
        expect(() => load(env)).toThrow(`Configuration not valid: ${message}`);
    };

    afterEach(() => {
        process.env = originalEnv;
    });

    it('é o provider do token de configuração', () => {
        expect(configProvider.provide).toBe(Service.CONFIG);
    });

    it('só com as obrigatórias: porta como número e os padrões', () => {
        const config = load();

        expect(config).toMatchObject({
            ...REQUIRED_ENV,
            API_PORT: 3000,
            APP_ENV: 'local',
            AUTH_COOKIE_NAME: 'refresh_token',
            AUTH_COOKIE_SAMESITE: 'strict',
            MAIL_ENABLED: '0',
            MAIL_SMTP_HOST: 'smtp.gmail.com',
            MAIL_SMTP_PORT: 465
        });
        // O Joi não passa o valor padrão pelo custom(): hoje fica o texto 'false', não o booleano (veja o relatório).
        expect(String(config.TRUST_PROXY)).toBe('false');

        for (const key of ['API_CORS_ORIGINS', 'SWAGGER_ENABLE', 'AUTH_COOKIE_DOMAIN', 'LOG_LEVEL', 'LOG_FORMAT', 'LOG_REQUEST_BODY',
            'SLOW_REQUEST_MS', 'SLOW_QUERY_MS', 'GIT_COMMIT_SHA', 'MAIL_SMTP_USER', 'MAIL_SMTP_PASS', 'MAIL_FROM'] as const) {
            expect(config[key]).toBeUndefined();
        }
    });

    it('variáveis vazias valem como ausentes', () => {
        const config = load({
            APP_ENV: '',
            API_CORS_ORIGINS: '',
            SWAGGER_ENABLE: '',
            TRUST_PROXY: '',
            AUTH_COOKIE_NAME: '',
            AUTH_COOKIE_SAMESITE: '',
            AUTH_COOKIE_DOMAIN: '',
            LOG_LEVEL: '',
            LOG_FORMAT: '',
            LOG_REQUEST_BODY: '',
            SLOW_REQUEST_MS: '',
            SLOW_QUERY_MS: '',
            GIT_COMMIT_SHA: ''
        });

        expect(config).toMatchObject({ APP_ENV: 'local', AUTH_COOKIE_NAME: 'refresh_token', AUTH_COOKIE_SAMESITE: 'strict' });
        expect(String(config.TRUST_PROXY)).toBe('false');
        for (const key of ['API_CORS_ORIGINS', 'SWAGGER_ENABLE', 'AUTH_COOKIE_DOMAIN', 'LOG_LEVEL', 'LOG_FORMAT', 'LOG_REQUEST_BODY',
            'SLOW_REQUEST_MS', 'SLOW_QUERY_MS', 'GIT_COMMIT_SHA'] as const) {
            expect(config[key]).toBeUndefined();
        }
    });

    it('aceita todas as opcionais preenchidas e converte números', () => {
        const config = load({
            APP_ENV: 'production',
            API_CORS_ORIGINS: 'https://app.exemplo.com',
            SWAGGER_ENABLE: '1',
            TRUST_PROXY: 'true',
            AUTH_COOKIE_NAME: 'golduck_refresh-1',
            AUTH_COOKIE_SAMESITE: 'none',
            AUTH_COOKIE_DOMAIN: '.exemplo.com',
            LOG_LEVEL: 'debug',
            LOG_FORMAT: 'json',
            LOG_REQUEST_BODY: 'all',
            SLOW_REQUEST_MS: '0',
            SLOW_QUERY_MS: '250',
            GIT_COMMIT_SHA: 'ABCDEF1'
        });

        expect(config).toMatchObject({
            APP_ENV: 'production',
            API_CORS_ORIGINS: ['https://app.exemplo.com'],
            SWAGGER_ENABLE: '1',
            TRUST_PROXY: true,
            AUTH_COOKIE_NAME: 'golduck_refresh-1',
            AUTH_COOKIE_SAMESITE: 'none',
            AUTH_COOKIE_DOMAIN: '.exemplo.com',
            LOG_LEVEL: 'debug',
            LOG_FORMAT: 'json',
            LOG_REQUEST_BODY: 'all',
            SLOW_REQUEST_MS: 0,
            SLOW_QUERY_MS: 250,
            GIT_COMMIT_SHA: 'ABCDEF1'
        });
    });

    it('mantém as demais variáveis do ambiente', () => {
        expect(load({ OUTRA_VARIAVEL: 'x' })).toMatchObject({ OUTRA_VARIAVEL: 'x' });
    });

    describe('obrigatórias', () => {
        it.each(Object.keys(REQUIRED_ENV))('sem %s a API não sobe', key => {
            expectInvalid({ [key]: undefined }, `"${key}" is required`);
        });

        it('API_PORT precisa ser número', () => {
            expectInvalid({ API_PORT: 'tres mil' }, '"API_PORT" must be a number');
        });

        it('JWT_SECRET precisa de pelo menos 32 caracteres', () => {
            expectInvalid({ JWT_SECRET: 'x'.repeat(31) }, '"JWT_SECRET" length must be at least 32 characters long');
            expect(load({ JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET).toBe('x'.repeat(32));
        });

        it('DATABASE_URL precisa ser postgres:// ou postgresql://', () => {
            expect(load({ DATABASE_URL: 'postgres://u:p@db:5432/x' }).DATABASE_URL).toBe('postgres://u:p@db:5432/x');
            expectInvalid({ DATABASE_URL: 'mysql://u:p@db:3306/x' }, '"DATABASE_URL" must be a valid uri with a scheme matching the postgresql|postgres pattern');
            expectInvalid({ DATABASE_URL: 'não é url' }, '"DATABASE_URL" must be a valid uri');
        });

        it('vazias não valem', () => {
            expectInvalid({ API_PREFIX: '' }, '"API_PREFIX" is not allowed to be empty');
            expectInvalid({ JWT_ISSUER: '' }, '"JWT_ISSUER" is not allowed to be empty');
        });
    });

    describe('APP_ENV', () => {
        it('aceita minúsculas, números e hífen, começando por letra', () => {
            expect(load({ APP_ENV: 'develop-2' }).APP_ENV).toBe('develop-2');
            expect(load({ APP_ENV: 'a' }).APP_ENV).toBe('a');
        });

        it('recusa maiúsculas, começo inválido e outros caracteres', () => {
            for (const value of ['Production', '1develop', '-develop', 'develop!', 'dev_1', 'dev elop']) {
                expectInvalid({ APP_ENV: value }, `"APP_ENV" with value "${value}" fails to match the required pattern`);
            }
        });
    });

    describe('API_CORS_ORIGINS', () => {
        it('separa por vírgula, tira espaços e itens vazios', () => {
            expect(load({ API_CORS_ORIGINS: ' https://app.exemplo.com, http://localhost:4200,, ' }).API_CORS_ORIGINS)
                .toEqual(['https://app.exemplo.com', 'http://localhost:4200']);
        });

        it('só vírgulas e espaços vira lista vazia', () => {
            expect(load({ API_CORS_ORIGINS: ' , ' }).API_CORS_ORIGINS).toEqual([]);
        });

        it('recusa o que não é URL', () => {
            expectInvalid({ API_CORS_ORIGINS: 'https://ok.com, app.exemplo' }, 'API_CORS_ORIGINS contains an invalid origin: app.exemplo');
        });

        it('recusa caminho, barra final, porta padrão escrita, maiúsculas e protocolo que não é http(s)', () => {
            for (const origin of ['https://app.exemplo.com/app', 'https://app.exemplo.com/', 'https://app.exemplo.com:443',
                'https://App.exemplo.com', 'ftp://app.exemplo.com', 'https://app.exemplo.com?x=1']) {
                expectInvalid(
                    { API_CORS_ORIGINS: `http://localhost:4200,${origin}` },
                    `API_CORS_ORIGINS must contain only origins like https://app.example.com: ${origin}`
                );
            }
        });
    });

    describe('demais opcionais', () => {
        it('SWAGGER_ENABLE só 0 ou 1', () => {
            expect(load({ SWAGGER_ENABLE: '0' }).SWAGGER_ENABLE).toBe('0');
            expectInvalid({ SWAGGER_ENABLE: 'true' }, '"SWAGGER_ENABLE" must be one of [0, 1]');
        });

        it('TRUST_PROXY nas várias formas', () => {
            expect(load({ TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
            expect(load({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
            expect(load({ TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
            expect(load({ TRUST_PROXY: '10.0.0.0/8, ::1' }).TRUST_PROXY).toBe('10.0.0.0/8,::1');
            expectInvalid({ TRUST_PROXY: 'proxy.local' },
                '"TRUST_PROXY" failed custom validation because TRUST_PROXY must be true, false, a number of hops or a list of IPs/CIDRs: proxy.local');
        });

        it('AUTH_COOKIE_NAME só letras, números, _ e -', () => {
            for (const value of ['meu cookie', 'a;b', 'nome=valor', 'çookie']) {
                expectInvalid({ AUTH_COOKIE_NAME: value }, `"AUTH_COOKIE_NAME" with value "${value}" fails to match the required pattern`);
            }
        });

        it('AUTH_COOKIE_SAMESITE: strict, lax ou none', () => {
            expect(load({ AUTH_COOKIE_SAMESITE: 'lax' }).AUTH_COOKIE_SAMESITE).toBe('lax');
            expectInvalid({ AUTH_COOKIE_SAMESITE: 'Strict' }, '"AUTH_COOKIE_SAMESITE" must be one of [strict, lax, none]');
        });

        it('AUTH_COOKIE_DOMAIN: domínio com ou sem ponto inicial, sem protocolo nem caminho', () => {
            for (const value of ['localhost', 'api.exemplo.com', '.exemplo.com', 'API.Exemplo.com']) {
                expect(load({ AUTH_COOKIE_DOMAIN: value }).AUTH_COOKIE_DOMAIN).toBe(value);
            }

            for (const value of ['https://exemplo.com', 'exemplo.com/', '..exemplo.com', 'exemplo..com', 'exemplo.com.', 'exe mplo.com']) {
                expectInvalid({ AUTH_COOKIE_DOMAIN: value }, `"AUTH_COOKIE_DOMAIN" with value "${value}" fails to match the required pattern`);
            }
        });

        it('níveis e modos de log só os conhecidos', () => {
            expectInvalid({ LOG_LEVEL: 'verbose' }, '"LOG_LEVEL" must be one of [error, warn, info, debug]');
            expectInvalid({ LOG_FORMAT: 'xml' }, '"LOG_FORMAT" must be one of [pretty, json]');
            expectInvalid({ LOG_REQUEST_BODY: 'sempre' }, '"LOG_REQUEST_BODY" must be one of [off, errors, all]');
        });

        it('tempos de lentidão: inteiros a partir de 0', () => {
            expectInvalid({ SLOW_REQUEST_MS: '-1' }, '"SLOW_REQUEST_MS" must be greater than or equal to 0');
            expectInvalid({ SLOW_QUERY_MS: '1.5' }, '"SLOW_QUERY_MS" must be an integer');
            expectInvalid({ SLOW_QUERY_MS: 'abc' }, '"SLOW_QUERY_MS" must be a number');
        });

        it('GIT_COMMIT_SHA: de 7 a 40 caracteres hexadecimais', () => {
            expect(load({ GIT_COMMIT_SHA: 'a'.repeat(40) }).GIT_COMMIT_SHA).toBe('a'.repeat(40));

            for (const value of ['abc123', 'a'.repeat(41), 'abcdefg', 'zabc1234', 'abc1234z']) {
                expectInvalid({ GIT_COMMIT_SHA: value }, `"GIT_COMMIT_SHA" with value "${value}" fails to match the required pattern`);
            }
        });
        it('e-mail: com MAIL_ENABLED=1 exige usuário e senha; porta numérica e servidor válido', () => {
            const mail = { MAIL_ENABLED: '1', MAIL_SMTP_USER: 'golduck@gmail.com', MAIL_SMTP_PASS: 'senha de app' };

            expect(load({ ...mail, MAIL_SMTP_PORT: '587', MAIL_FROM: 'Golduck <golduck@gmail.com>' })).toMatchObject({
                ...mail,
                MAIL_SMTP_PORT: 587,
                MAIL_FROM: 'Golduck <golduck@gmail.com>'
            });
            expectInvalid({ ...mail, MAIL_SMTP_USER: '' }, '"MAIL_SMTP_USER" is required');
            expectInvalid({ ...mail, MAIL_SMTP_PASS: undefined }, '"MAIL_SMTP_PASS" is required');
            expectInvalid({ MAIL_ENABLED: 'sim' }, '"MAIL_ENABLED" must be one of [0, 1]');
            expectInvalid({ MAIL_SMTP_PORT: '70000' }, '"MAIL_SMTP_PORT" must be less than or equal to 65535');
            expectInvalid({ MAIL_SMTP_HOST: 'smtp gmail' }, '"MAIL_SMTP_HOST" must be a valid hostname');
        });
    });

    describe('subida da API', () => {
        it('com configuração inválida o módulo nem é criado', async () => {
            process.env = { ...REQUIRED_ENV, JWT_SECRET: 'curto' };

            await expect(Test.createTestingModule({ imports: [CommonModule] })
                .overrideProvider(PrismaService).useValue({})
                .compile()).rejects.toThrow('Configuration not valid: "JWT_SECRET" length must be at least 32 characters long');
        });

        it('com configuração válida o módulo entrega a Config pelo token', async () => {
            process.env = { ...REQUIRED_ENV };

            const moduleRef = await Test.createTestingModule({ imports: [CommonModule] })
                .overrideProvider(PrismaService).useValue({})
                .compile();

            expect(moduleRef.get<Config>(Service.CONFIG)).toMatchObject({ API_PORT: 3000, API_PREFIX: '/api' });
            await moduleRef.close();
        });
    });
});
