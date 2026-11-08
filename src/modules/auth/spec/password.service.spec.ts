import { jest } from '@jest/globals';

import { PasswordService } from '../security/password.service.js';

/** Argon2id com 19 MiB de memória, 2 passadas e paralelismo 1 (mínimo recomendado pelo OWASP). */
const ARGON2_PREFIX = '$argon2id$v=19$m=19456,p=1,t=2$';

describe('PasswordService', () => {
    let service: PasswordService;

    beforeEach(() => {
        service = new PasswordService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('gera hash Argon2id com os parâmetros combinados e um sal novo a cada vez', async () => {
        const first = await service.hashPassword('senha-correta-123');
        const second = await service.hashPassword('senha-correta-123');

        expect(first.startsWith(ARGON2_PREFIX)).toBe(true);
        expect(second.startsWith(ARGON2_PREFIX)).toBe(true);
        expect(first).not.toBe(second);
        expect(first).not.toContain('senha-correta-123');
    });

    it('confere a senha contra o hash guardado', async () => {
        const hash = await service.hashPassword('senha-correta-123');

        await expect(service.verifyPassword('senha-correta-123', hash)).resolves.toBe(true);
        await expect(service.verifyPassword('senha-errada', hash)).resolves.toBe(false);
        await expect(service.verifyPassword('Senha-correta-123', hash)).resolves.toBe(false);
    });

    it('a comparação de mentira gasta uma verificação real e sempre devolve false', async () => {
        const verify = jest.spyOn(service, 'verifyPassword');

        await expect(service.verifyAgainstDummy('qualquer-senha')).resolves.toBe(false);

        expect(verify).toHaveBeenCalledTimes(1);
        expect(verify.mock.calls[0][0]).toBe('qualquer-senha');
        expect(verify.mock.calls[0][1].startsWith(ARGON2_PREFIX)).toBe(true);
    });

    it('o hash de mentira é criado uma vez só e reaproveitado (mesmo em chamadas simultâneas)', async () => {
        const hash = jest.spyOn(service, 'hashPassword');
        const verify = jest.spyOn(service, 'verifyPassword');

        await Promise.all([service.verifyAgainstDummy('a'), service.verifyAgainstDummy('b')]);
        await service.verifyAgainstDummy('c');

        expect(hash).toHaveBeenCalledTimes(1);
        expect(new Set(verify.mock.calls.map(call => call[1])).size).toBe(1);
    });
});
