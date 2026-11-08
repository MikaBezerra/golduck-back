import type { Config } from '../../common/index.js';
import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { Service } from '../../tokens.js';

const ACCESS_TOKEN_AUDIENCE = 'financas-api';

export interface AccessTokenIdentity {
    readonly userId: string;
    readonly sessionId: string;
}

@Injectable()
export class AccessTokenService {
    public constructor(
        @Inject(Service.CONFIG)
        private readonly config: Config
    ) { }

    public generate(userId: string, sessionId: string): string {
        return jwt.sign(
            { sid: sessionId },
            this.config.JWT_SECRET,
            {
                algorithm: 'HS256',
                audience: ACCESS_TOKEN_AUDIENCE,
                issuer: this.config.JWT_ISSUER,
                subject: userId,
                expiresIn: '15m'
            }
        );
    }

    /**
     * Confere assinatura, emissor e público do token. `ignoreExpiration` aceita token vencido e
     * serve só para o logout, que precisa saber de qual sessão o token era.
     */
    public verify(token: string, options: { ignoreExpiration?: boolean } = {}): AccessTokenIdentity | null {
        try {
            const payload = jwt.verify(token, this.config.JWT_SECRET, {
                algorithms: ['HS256'],
                audience: ACCESS_TOKEN_AUDIENCE,
                issuer: this.config.JWT_ISSUER,
                ignoreExpiration: options.ignoreExpiration === true
            });

            if (typeof payload === 'string') {
                return null;
            }

            const userId: unknown = payload.sub;
            const sessionId: unknown = payload.sid;

            if (
                typeof userId !== 'string' ||
                typeof sessionId !== 'string' ||
                !userId ||
                !sessionId
            ) {
                return null;
            }

            return { userId, sessionId };
        } catch {
            return null;
        }
    }
}
