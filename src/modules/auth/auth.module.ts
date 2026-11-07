import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { CommonModule } from '../common';
import { AuthController } from './controller/auth.controller';
import { AuthRepository } from './repository/auth.repository';
import { AccessTokenService } from './security/access-token.service';
import { JwtAuthGuard } from './security/jwt-auth.guard';
import { PasswordService } from './security/password.service';
import { RefreshCookieService } from './security/refresh-cookie.service';
import { RefreshTokenService } from './security/refresh-token.service';
import { RolesGuard } from './security/roles.guard';
import { AuthService } from './service/auth.service';

@Module({
    imports: [CommonModule],
    controllers: [AuthController],
    providers: [
        AuthRepository,
        PasswordService,
        RefreshTokenService,
        RefreshCookieService,
        AccessTokenService,
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
