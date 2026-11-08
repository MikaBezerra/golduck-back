import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CommonModule } from '../common/index.js';
import { AuthController } from './controller/auth.controller.js';
import { AuthRepository } from './repository/auth.repository.js';
import { AccessTokenService } from './security/access-token.service.js';
import { JwtAuthGuard } from './security/jwt-auth.guard.js';
import { LoginAttemptsService } from './security/login-attempts.service.js';
import { PasswordService } from './security/password.service.js';
import { RefreshCookieService } from './security/refresh-cookie.service.js';
import { RefreshTokenService } from './security/refresh-token.service.js';
import { RolesGuard } from './security/roles.guard.js';
import { AuthService } from './service/auth.service.js';

@Module({
    imports: [CommonModule],
    controllers: [AuthController],
    providers: [
        AuthRepository,
        PasswordService,
        RefreshTokenService,
        RefreshCookieService,
        AccessTokenService,
        LoginAttemptsService,
        AuthService,
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard
        },
        {
            provide: APP_GUARD,
            useClass: RolesGuard
        }
    ]
})
export class AuthModule {}
