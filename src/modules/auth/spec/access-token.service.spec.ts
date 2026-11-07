import type { Config } from '../../common';
import { jest } from '@jest/globals';
import * as jwt from 'jsonwebtoken';

import { AccessTokenService } from '../security/access-token.service';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const ISSUER = 'testes';
const AUDIENCE = 'financas-api';
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const NOW_SECONDS = NOW / 1000;

/** Token HS256 com o segredo do teste e as claims dadas (aud e iss certos, salvo se sobrescritos). */
function sign(claims: Record<string, unknown>, secret: string = SECRET, algorithm: jwt.Algorithm = 'HS256'): string {
    return jwt.sign({ aud: AUDIENCE, iss: ISSUER, iat: NOW_SECONDS, exp: NOW_SECONDS + 900, ...claims }, secret, { algorithm });
}

describe('AccessTokenService', () => {
    const service = new AccessTokenService({ JWT_SECRET: SECRET, JWT_ISSUER: ISSUER } as Config);

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('gera um JWT HS256 de 15 minutos com usuário (sub), sessão (sid), emissor e público', () => {
        const token = service.generate('user-1', 'session-1');
        const decoded = jwt.decode(token, { complete: true });

        expect(decoded?.header).toEqual({ alg: 'HS256', typ: 'JWT' });
        expect(decoded?.payload).toEqual({
            sid: 'session-1',
            sub: 'user-1',
            aud: AUDIENCE,
            iss: ISSUER,
            iat: NOW_SECONDS,
            exp: NOW_SECONDS + 15 * 60
        });
    });

    it('verify devolve usuário e sessão de um token gerado aqui', () => {
        expect(service.verify(service.generate('user-1', 'session-1'))).toEqual({ userId: 'user-1', sessionId: 'session-1' });
    });

    it('recusa (null) token que não é JWT, de outro segredo, de outro emissor ou para outro público', () => {
        const rejected = [
            'nao-e-um-jwt',
            '',
            sign({ sub: 'user-1', sid: 'session-1' }, 'outro-segredo-com-mais-de-32-caracteres!!'),
            sign({ sub: 'user-1', sid: 'session-1', iss: 'outro-emissor' }),
            sign({ sub: 'user-1', sid: 'session-1', aud: 'outra-api' })
        ];

        for (const token of rejected) {
            expect(service.verify(token)).toBeNull();
        }
    });

    it('só aceita HS256: o mesmo segredo com HS512 ou um token sem assinatura (alg none) não passam', () => {
        const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${
            Buffer.from(JSON.stringify({ sub: 'user-1', sid: 'session-1', aud: AUDIENCE, iss: ISSUER, exp: NOW_SECONDS + 900 })).toString('base64url')}.`;

        expect(service.verify(sign({ sub: 'user-1', sid: 'session-1' }, SECRET, 'HS512'))).toBeNull();
        expect(service.verify(unsigned)).toBeNull();
    });

    it('token vencido é recusado, salvo com ignoreExpiration (usado só no logout)', () => {
        const expired = sign({ sub: 'user-1', sid: 'session-1', exp: NOW_SECONDS - 1 });

        expect(service.verify(expired)).toBeNull();
        expect(service.verify(expired, {})).toBeNull();
        expect(service.verify(expired, { ignoreExpiration: false })).toBeNull();
        expect(service.verify(expired, { ignoreExpiration: true })).toEqual({ userId: 'user-1', sessionId: 'session-1' });
    });

    it('mesmo ignorando a validade, a assinatura continua conferida', () => {
        const forged = sign({ sub: 'user-1', sid: 'session-1', exp: NOW_SECONDS - 1 }, 'outro-segredo-com-mais-de-32-caracteres!!');

        expect(service.verify(forged, { ignoreExpiration: true })).toBeNull();
    });

    it('recusa token sem usuário ou sessão, com eles vazios ou que não sejam texto', () => {
        const rejected = [
            sign({ sid: 'session-1' }),
            sign({ sub: 'user-1' }),
            sign({ sub: '', sid: 'session-1' }),
            sign({ sub: 'user-1', sid: '' }),
            sign({ sub: 123, sid: 'session-1' }),
            sign({ sub: 'user-1', sid: 456 })
        ];

        for (const token of rejected) {
            expect(service.verify(token)).toBeNull();
        }
    });

    it('recusa token cujo conteúdo é texto, não um objeto de claims', () => {
        expect(service.verify(jwt.sign('so-um-texto', SECRET, { algorithm: 'HS256' }))).toBeNull();
    });
});
