import type { AuthSession, User } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';

@Injectable()
export class AuthRepository {
    public constructor(
        private readonly prisma: PrismaService
    ) { }

    public async findUserByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() }
        });
    }

    public async findByUserId(userId: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id: userId }
        });
    }

    public async createSession(
        sessionId: string,
        userId: string,
        tokenHash: string,
        expiresAt: Date
    ): Promise<AuthSession> {
        return this.prisma.authSession.create({
            data: {
                id: sessionId,
                userId,
                tokenHash,
                expiresAt
            }
        });
    }

    public async findSessionById(sessionId: string): Promise<AuthSession | null> {
        return this.prisma.authSession.findUnique({
            where: { id: sessionId }
        });
    }

    public async rotateSession(
        sessionId: string,
        currentTokenHash: string,
        nextTokenHash: string,
        nextExpiresAt: Date
    ): Promise<boolean> {
        const result = await this.prisma.authSession.updateMany({
            where: {
                id: sessionId,
                tokenHash: currentTokenHash,
                revokedAt: null,
                expiresAt: { gt: new Date() }
            },
            data: {
                tokenHash: nextTokenHash,
                expiresAt: nextExpiresAt
            }
        });

        return result.count === 1;
    }

    public async revokeSession(sessionId: string, userId: string): Promise<void> {
        await this.prisma.authSession.updateMany({
            where: {
                id: sessionId,
                userId,
                revokedAt: null
            },
            data: {
                revokedAt: new Date()
            }
        });
    }
}
