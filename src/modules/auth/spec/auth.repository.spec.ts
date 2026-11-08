import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { AuthRepository } from '../repository/auth.repository.js';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

/*
 * O repositório só monta consultas do Prisma; o teste confere os argumentos exatos. É aqui que
 * mora a regra da rotação: só gira a sessão com o hash atual, não encerrada e dentro da validade.
 */
describe('AuthRepository', () => {
    const user = { id: 'user-1', email: 'pessoa@exemplo.com' };
    const session = { id: 'session-1', userId: 'user-1' };
    const prisma = {
        user: {
            findUnique: jest.fn(async () => Promise.resolve(user))
        },
        authSession: {
            create: jest.fn(async () => Promise.resolve(session)),
            findUnique: jest.fn(async () => Promise.resolve(session)),
            updateMany: jest.fn(async () => Promise.resolve({ count: 1 }))
        }
    };
    const repository = new AuthRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers({ now: NOW });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('findUserByEmail busca pelo e-mail sem espaços e em minúsculas', async () => {
        await expect(repository.findUserByEmail('  Pessoa@Exemplo.COM ')).resolves.toBe(user);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'pessoa@exemplo.com' } });
    });

    it('findByUserId e findSessionById buscam pelo id', async () => {
        await expect(repository.findByUserId('user-1')).resolves.toBe(user);
        await expect(repository.findSessionById('session-1')).resolves.toBe(session);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
        expect(prisma.authSession.findUnique).toHaveBeenCalledWith({ where: { id: 'session-1' } });
    });

    it('createSession grava id, usuário, hash do token e validade', async () => {
        const expiresAt = new Date(NOW + 1000);

        await expect(repository.createSession('session-1', 'user-1', 'hash-1', expiresAt)).resolves.toBe(session);

        expect(prisma.authSession.create).toHaveBeenCalledWith({
            data: { id: 'session-1', userId: 'user-1', tokenHash: 'hash-1', expiresAt }
        });
    });

    describe('rotateSession', () => {
        it('troca hash e validade só da sessão com o hash atual, não encerrada e ainda no prazo', async () => {
            const nextExpiresAt = new Date(NOW + 7 * 24 * 60 * 60 * 1000);

            await repository.rotateSession('session-1', 'hash-atual', 'hash-novo', nextExpiresAt);

            expect(prisma.authSession.updateMany).toHaveBeenCalledTimes(1);
            expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
                where: { id: 'session-1', tokenHash: 'hash-atual', revokedAt: null, expiresAt: { gt: new Date(NOW) } },
                data: { tokenHash: 'hash-novo', expiresAt: nextExpiresAt }
            });
        });

        it('devolve true só quando exatamente uma sessão foi alterada', async () => {
            const expiresAt = new Date(NOW + 1000);

            prisma.authSession.updateMany.mockResolvedValueOnce({ count: 1 });
            await expect(repository.rotateSession('session-1', 'a', 'b', expiresAt)).resolves.toBe(true);

            // Nenhuma alterada: o hash já foi usado (reuso), a sessão foi encerrada ou venceu.
            prisma.authSession.updateMany.mockResolvedValueOnce({ count: 0 });
            await expect(repository.rotateSession('session-1', 'a', 'b', expiresAt)).resolves.toBe(false);

            prisma.authSession.updateMany.mockResolvedValueOnce({ count: 2 });
            await expect(repository.rotateSession('session-1', 'a', 'b', expiresAt)).resolves.toBe(false);
        });
    });

    it('revokeSession encerra agora só a sessão do usuário que ainda estava aberta', async () => {
        await expect(repository.revokeSession('session-1', 'user-1')).resolves.toBeUndefined();

        expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
            where: { id: 'session-1', userId: 'user-1', revokedAt: null },
            data: { revokedAt: new Date(NOW) }
        });
    });
});
