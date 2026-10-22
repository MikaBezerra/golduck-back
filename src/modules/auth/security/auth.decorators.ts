import type { Role } from '../../../generated/prisma/client';
import { SetMetadata } from '@nestjs/common';


export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

export function Public(): MethodDecorator & ClassDecorator {
    return SetMetadata(IS_PUBLIC_KEY, true);
}

export function Roles(...roles: Role[]): MethodDecorator & ClassDecorator {
    return SetMetadata(ROLES_KEY, roles);
}
