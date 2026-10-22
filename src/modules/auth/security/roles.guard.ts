import type { AuthenticatedRequest } from './jwt-auth.guard';
import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../../generated/prisma/client';
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
            throw new UnauthorizedException();
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

        throw new ForbiddenException();
    }
}
