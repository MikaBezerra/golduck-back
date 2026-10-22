import type { AuthenticatedRequest } from './jwt-auth.guard';
import {
    CanActivate,
    ExecutionContext,
    Injectable
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../../generated/prisma/client';
import { AUTH_ERRORS } from '../errors/auth.errors';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector
    ) { }

    public canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const identity = request.auth;

        if (!identity) {
            throw AUTH_ERRORS.unauthenticated('identity_missing_after_guard');
        }

        if (identity.role === Role.ADMIN) {
            return true;
        }

        const allowedRoles = this.reflector.getAllAndOverride<Role[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (allowedRoles?.includes(identity.role)) {
            return true;
        }

        throw AUTH_ERRORS.forbidden('role_not_allowed');
    }
}
