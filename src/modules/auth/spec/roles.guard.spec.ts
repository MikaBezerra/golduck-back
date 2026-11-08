import type { ControllerClass } from './http-execution-context.js';
import type { AppError } from '../../common/errors/app-error.js';
import type { AuthenticatedIdentity } from '../security/jwt-auth.guard.js';
import { Reflector } from '@nestjs/core';

import { Role } from '../../../generated/prisma/enums.js';
import { Public, Roles } from '../security/auth.decorators.js';
import { RolesGuard } from '../security/roles.guard.js';
import { httpContext } from './http-execution-context.js';

/* Rotas de mentira: o guard só lê os metadados (@Public, @Roles) do método e da classe. */
class MixedController {
    @Roles(Role.USER)
    public forUsers(): string {
        return 'USER';
    }

    @Roles(Role.ADMIN)
    public forAdmins(): string {
        return 'ADMIN';
    }

    @Roles()
    public emptyRoles(): string {
        return 'ninguém listado';
    }

    @Public()
    public open(): string {
        return 'pública';
    }

    public withoutRoles(): string {
        return 'sem @Roles';
    }
}

@Roles(Role.USER)
class UsersController {
    @Roles(Role.ADMIN)
    public adminOnly(): string {
        return 'o método vale mais que a classe';
    }

    public inherited(): string {
        return 'herda USER da classe';
    }
}

@Roles(Role.ADMIN)
class AdminsController {
    @Roles(Role.USER)
    public openedToUsers(): string {
        return 'o método vale mais que a classe';
    }
}

@Public()
class PublicController {
    public anything(): string {
        return 'pública';
    }
}

const identity = (role: Role): AuthenticatedIdentity => ({ userId: 'user-1', email: 'pessoa@exemplo.com', sessionId: 'session-1', role });

/** O erro lançado (o guard é síncrono). */
function thrownBy(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }

    throw new Error('era esperado um erro');
}

describe('RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());

    const check = (controller: ControllerClass, method: string, auth?: AuthenticatedIdentity): boolean =>
        guard.canActivate(httpContext(controller, method, () => ({ auth })));

    const expectForbidden = (controller: ControllerClass, method: string, role: Role): void => {
        expect(thrownBy(() => check(controller, method, identity(role)))).toMatchObject({
            code: 'AUTH_FORBIDDEN', statusCode: 403, reason: 'role_not_allowed'
        } satisfies Partial<AppError>);
    };

    it('rota @Public passa mesmo sem identidade (no método ou na classe)', () => {
        expect(check(MixedController, 'open')).toBe(true);
        expect(check(PublicController, 'anything')).toBe(true);
    });

    it('rota privada sem identidade (o JwtAuthGuard não rodou): 401 identity_missing_after_guard', () => {
        expect(thrownBy(() => check(MixedController, 'forUsers'))).toMatchObject({
            code: 'AUTH_UNAUTHENTICATED', statusCode: 401, reason: 'identity_missing_after_guard'
        } satisfies Partial<AppError>);
    });

    it('ADMIN passa sempre, mesmo em rota sem @Roles ou só de USER', () => {
        for (const method of ['withoutRoles', 'forUsers', 'forAdmins', 'emptyRoles']) {
            expect(check(MixedController, method, identity(Role.ADMIN))).toBe(true);
        }

        expect(check(UsersController, 'inherited', identity(Role.ADMIN))).toBe(true);
    });

    it('USER passa onde o papel dele está listado (no método ou na classe)', () => {
        expect(check(MixedController, 'forUsers', identity(Role.USER))).toBe(true);
        expect(check(UsersController, 'inherited', identity(Role.USER))).toBe(true);
    });

    it('o @Roles do método vale mais que o da classe', () => {
        expect(check(AdminsController, 'openedToUsers', identity(Role.USER))).toBe(true);
        expectForbidden(UsersController, 'adminOnly', Role.USER);
    });

    it('USER sem o papel na lista: 403 role_not_allowed (rota sem @Roles é só de ADMIN)', () => {
        expectForbidden(MixedController, 'forAdmins', Role.USER);
        expectForbidden(MixedController, 'withoutRoles', Role.USER);
        expectForbidden(MixedController, 'emptyRoles', Role.USER);
    });
});
