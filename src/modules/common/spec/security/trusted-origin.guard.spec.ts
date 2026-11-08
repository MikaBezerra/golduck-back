import type { AppError } from '../../errors/app-error.js';
import type { Config } from '../../model/index.js';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { isTrustedOrigin, TrustedOrigin, TrustedOriginGuard } from '../../security/index.js';

const FRONT = 'https://front.test';
const LOCAL_FRONT = 'http://localhost:4200';

/** Requisição que chegou na API em `protocol://host` (o host inclui a porta, se houver). */
function apiRequest(protocol: string, host: string, origin?: string): FastifyRequest {
    return { protocol, host, headers: origin === undefined ? {} : { origin } } as unknown as FastifyRequest;
}

describe('isTrustedOrigin', () => {
    const request = apiRequest('http', '127.0.0.1:3000');
    const trusted = (origin: string, allowed: readonly string[] = [FRONT, LOCAL_FRONT]): boolean => isTrustedOrigin(origin, request, allowed);

    it('aceita as origens de API_CORS_ORIGINS', () => {
        expect(trusted(FRONT)).toBe(true);
        expect(trusted(LOCAL_FRONT)).toBe(true);
    });

    it('compara a origem normalizada: porta padrão, maiúsculas e barra final não mudam a origem', () => {
        expect(trusted('https://front.test:443')).toBe(true);
        expect(trusted('HTTPS://FRONT.TEST')).toBe(true);
        expect(trusted('https://front.test/')).toBe(true);
        expect(trusted('http://localhost:4200/qualquer/caminho')).toBe(true);
    });

    it('recusa o mesmo domínio com outro protocolo ou outra porta, e subdomínios', () => {
        for (const origin of ['http://front.test', 'https://front.test:8443', 'http://localhost:4201', 'https://localhost:4200', 'https://app.front.test']) {
            expect(trusted(origin)).toBe(false);
        }
    });

    it('recusa origem que não é URL http(s): "null", vazia, ftp, javascript', () => {
        for (const origin of ['null', '', 'front.test', 'ftp://front.test', 'javascript:alert(1)']) {
            expect(trusted(origin)).toBe(false);
        }
    });

    it('ftp não passa nem se estiver na lista', () => {
        expect(trusted('ftp://front.test', ['ftp://front.test'])).toBe(false);
    });

    it('aceita a própria API (mesmo protocolo, host e porta), mesmo com a lista vazia', () => {
        expect(trusted('http://127.0.0.1:3000', [])).toBe(true);
        expect(trusted('http://127.0.0.1:3001', [])).toBe(false);
        expect(trusted('https://127.0.0.1:3000', [])).toBe(false);
        expect(isTrustedOrigin('https://api.exemplo.com:443', apiRequest('https', 'api.exemplo.com'), [])).toBe(true);
        expect(isTrustedOrigin('https://api.exemplo.com', apiRequest('https', 'API.exemplo.com:443'), [])).toBe(true);
    });

    it('origem inválida não passa nem quando o endereço da própria API também é inválido', () => {
        expect(isTrustedOrigin('null', apiRequest('http', ''), [])).toBe(false);
        expect(isTrustedOrigin('null', apiRequest('ftp', 'x'), [])).toBe(false);
    });
});

describe('TrustedOriginGuard', () => {
    const contextFor = (request: FastifyRequest): ExecutionContext =>
        ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

    const guardWith = (origins: string[] | undefined): TrustedOriginGuard =>
        new TrustedOriginGuard({ API_CORS_ORIGINS: origins } as Config);

    /** O erro lançado (o guard é síncrono). */
    const thrownBy = (action: () => unknown): unknown => {
        try {
            action();
        } catch (error) {
            return error;
        }

        throw new Error('era esperado um erro');
    };

    it('sem header Origin passa (curl, apps, servidores: não é um navegador agindo por outro site)', () => {
        expect(guardWith([FRONT]).canActivate(contextFor(apiRequest('http', '127.0.0.1:3000')))).toBe(true);
    });

    it('Origin do front ou da própria API passa', () => {
        const guard = guardWith([FRONT]);

        expect(guard.canActivate(contextFor(apiRequest('http', '127.0.0.1:3000', FRONT)))).toBe(true);
        expect(guard.canActivate(contextFor(apiRequest('http', '127.0.0.1:3000', 'http://127.0.0.1:3000')))).toBe(true);
    });

    it('sem API_CORS_ORIGINS, só a própria API passa', () => {
        const guard = guardWith(undefined);

        expect(guard.canActivate(contextFor(apiRequest('http', '127.0.0.1:3000', 'http://127.0.0.1:3000')))).toBe(true);
        expect(thrownBy(() => guard.canActivate(contextFor(apiRequest('http', '127.0.0.1:3000', FRONT))))).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('Origin estranho, vazio ou "null": 403 FORBIDDEN com a origem no motivo do log', () => {
        const guard = guardWith([FRONT]);

        for (const origin of ['https://site-malicioso.test', '', 'null']) {
            expect(thrownBy(() => guard.canActivate(contextFor(apiRequest('http', '127.0.0.1:3000', origin))))).toMatchObject({
                code: 'FORBIDDEN', statusCode: 403, reason: `origin_not_allowed: ${origin}`
            } satisfies Partial<AppError>);
        }
    });
});

describe('@TrustedOrigin', () => {
    class Controller {
        @TrustedOrigin()
        public refresh(): string {
            return 'refresh';
        }
    }

    it('liga o TrustedOriginGuard na rota e documenta o 403 no Swagger', () => {
        const reflector = new Reflector();
        const handler = Object.getOwnPropertyDescriptor(Controller.prototype, 'refresh')?.value as () => unknown;

        expect(reflector.get<unknown[]>('__guards__', handler)).toEqual([TrustedOriginGuard]);
        expect(reflector.get<Record<string, { description: string }>>('swagger/apiResponse', handler)['403']).toMatchObject({
            description: 'Origem não permitida (FORBIDDEN)'
        });
    });
});
