import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Validade da sessão (e do cookie do refresh token): 7 dias, renovados a cada refresh. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface GeneratedRefreshToken {
    readonly sessionId: string;
    readonly token: string;
    readonly tokenHash: string;
}

export interface ParsedRefreshToken {
    readonly sessionId: string;
    readonly tokenHash: string;
}

@Injectable()
export class RefreshTokenService {
    public generate(sessionId: string = randomUUID()): GeneratedRefreshToken {
        const secret = randomBytes(32).toString('base64url'); // 43caractes
        const token = `${sessionId}.${secret}`;

        return {
            sessionId,
            token,
            tokenHash: this.hash(token)
        };
    }

    public parse(token: string): ParsedRefreshToken | null {
        if (token.length !== 80) {
            return null;
        }

        const [sessionId, secret] = token.split('.');

        if (!UUID_PATTERN.test(sessionId) || !SECRET_PATTERN.test(secret)) {
            return null;
        }

        return {
            sessionId,
            tokenHash: this.hash(token)
        };
    }

    private hash(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}
