import { createHash } from 'node:crypto';

import { REFRESH_TOKEN_TTL_MS, RefreshTokenService, SESSION_MAX_AGE_MS } from '../security/refresh-token.service';

const SESSION_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
/** 43 caracteres base64url (inclusive _ e -). */
const SECRET = `${'A'.repeat(21)}_-${'z9'.repeat(10)}`;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('RefreshTokenService', () => {
    const service = new RefreshTokenService();

    it('sessão vale 7 dias, renováveis até 30 dias desde o login', () => {
        expect(REFRESH_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
        expect(SESSION_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });

    describe('generate', () => {
        it('monta "<sessão>.<segredo de 43 caracteres base64url>" (80 caracteres) e guarda só o SHA-256', () => {
            const generated = service.generate(SESSION_ID);
            const [sessionId, secret] = generated.token.split('.');

            expect(generated.sessionId).toBe(SESSION_ID);
            expect(sessionId).toBe(SESSION_ID);
            expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
            expect(generated.token).toHaveLength(80);
            expect(generated.tokenHash).toBe(sha256(generated.token));
        });

        it('sem sessão informada, cria um UUID v4 novo; o segredo muda a cada chamada', () => {
            const first = service.generate();
            const second = service.generate();

            expect(first.sessionId).toMatch(UUID_V4);
            expect(first.token.startsWith(`${first.sessionId}.`)).toBe(true);
            expect(second.sessionId).not.toBe(first.sessionId);
            expect(service.generate(SESSION_ID).token).not.toBe(service.generate(SESSION_ID).token);
        });

        it('o token gerado é aceito pelo parse, com o mesmo hash', () => {
            const generated = service.generate();

            expect(service.parse(generated.token)).toEqual({ sessionId: generated.sessionId, tokenHash: generated.tokenHash });
        });
    });

    describe('parse', () => {
        it('aceita UUID em maiúsculas e devolve o hash do token como veio', () => {
            const token = `${SESSION_ID.toUpperCase()}.${SECRET}`;

            expect(service.parse(token)).toEqual({ sessionId: SESSION_ID.toUpperCase(), tokenHash: sha256(token) });
        });

        it('recusa tamanho diferente de 80 caracteres', () => {
            expect(service.parse(`${SESSION_ID}.${SECRET.slice(1)}`)).toBeNull();
            expect(service.parse(`${SESSION_ID}.${SECRET}x`)).toBeNull();
            expect(service.parse(`${SESSION_ID}.${SECRET}.x`)).toBeNull();
            expect(service.parse('')).toBeNull();
        });

        it('recusa sessão que não é UUID v4', () => {
            const notUuid = [
                '7a8b9c0d-1e2f-1a3b-8c4d-5e6f7a8b9c0d', // versão 1
                '7a8b9c0d-1e2f-4a3b-7c4d-5e6f7a8b9c0d', // variante inválida
                '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0g', // letra fora do hexadecimal
                '7a8b9c0d11e2f-4a3b-8c4d-5e6f7a8b9c0d' // sem o primeiro hífen
            ];

            for (const sessionId of notUuid) {
                expect(service.parse(`${sessionId}.${SECRET}`)).toBeNull();
            }
        });

        it('recusa segredo com caracteres fora do base64url ou sem o ponto separador', () => {
            for (const secret of [`${SECRET.slice(1)}+`, `${SECRET.slice(1)}=`, `${SECRET.slice(1)}/`, `${SECRET.slice(1)} `]) {
                expect(service.parse(`${SESSION_ID}.${secret}`)).toBeNull();
            }

            expect(service.parse(`${SESSION_ID}x${SECRET}`)).toBeNull();
            expect(service.parse(`${SESSION_ID}.${SECRET.slice(2)}.x`)).toBeNull();
        });
    });
});
