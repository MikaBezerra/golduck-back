import type { AuthSession, User } from '../../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

import { Role } from '../../../generated/prisma/enums.js';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do AuthRepository */
/**
 * AuthRepository em memória, com as mesmas regras das consultas reais: e-mail sem diferenciar
 * maiúsculas, rotação só da sessão com o hash atual, ativa e dentro da validade, e encerramento só
 * da sessão do próprio usuário.
 */
export class InMemoryAuthRepository {
    public readonly users = new Map<string, User>();
    public readonly sessions = new Map<string, AuthSession>();

    /** Cadastra um usuário direto, sem passar pelo serviço (monta o cenário do teste). */
    public seedUser(data: Partial<User> = {}): User {
        const now = new Date();
        const user: User = {
            id: randomUUID(),
            email: 'pessoa@exemplo.com',
            role: Role.USER,
            active: true,
            hash: 'hash-nao-usado',
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.users.set(user.id, user);
        return user;
    }

    /** Cadastra uma sessão direto (por padrão ativa e vencendo em 1 hora). */
    public seedSession(data: Partial<AuthSession> & Pick<AuthSession, 'userId'>): AuthSession {
        const now = new Date();
        const session: AuthSession = {
            id: randomUUID(),
            tokenHash: 'hash-do-token',
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
            revokedAt: null,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.sessions.set(session.id, session);
        return session;
    }

    public async findUserByEmail(email: string): Promise<User | null> {
        const normalized = email.trim().toLowerCase();
        return [...this.users.values()].find(user => user.email === normalized) ?? null;
    }

    public async findByUserId(userId: string): Promise<User | null> {
        return this.users.get(userId) ?? null;
    }

    public async createSession(sessionId: string, userId: string, tokenHash: string, expiresAt: Date): Promise<AuthSession> {
        return this.seedSession({ id: sessionId, userId, tokenHash, expiresAt });
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
