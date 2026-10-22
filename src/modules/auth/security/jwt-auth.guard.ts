import type { Role } from '../../../generated/prisma/client';
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { AuthRepository } from '../repository/auth.repository';
import { AccessTokenService } from './access-token.service';
import { IS_PUBLIC_KEY } from './auth.decorators';

export interface AuthenticatedIdentity {
    readonly userId: string;
    readonly sessionId: string;
    readonly role: Role;
}

export type AuthenticatedRequest = FastifyRequest & {
    auth?: AuthenticatedIdentity;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly accessTokenService: AccessTokenService,
        private readonly repository: AuthRepository
    ) { }

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const header = request.headers.authorization;
        const match = typeof header === 'string'
            ? /^Bearer +(\S+)$/i.exec(header)
            : null;

        if (!match) {
            throw new UnauthorizedException();
        }

        const identity = this.accessTokenService.verify(match[1]);

        if (!identity) {
            throw new UnauthorizedException();
        }

        const user = await this.repository.findByUserId(identity.userId);

        if (!user || !user.active) {
            throw new UnauthorizedException();
        }

        const session = await this.repository.findSessionById(identity.sessionId);

        if (
            !session ||
            session.userId !== user.id ||
            session.revokedAt !== null ||
            session.expiresAt.getTime() <= Date.now()
        ) {
            throw new UnauthorizedException();
        }

        request.auth = {
            userId: user.id,
            sessionId: session.id,
            role: user.role
        };

        return true;
    }
}
