import type { AuthenticatedRequest } from '../security/jwt-auth.guard';
import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req
} from '@nestjs/common';

import { Role } from '../../../generated/prisma/client';
import { AuthTokensDto, LoginDto, RefreshDto } from '../dto/auth.dto';
import { AUTH_ERRORS } from '../errors/auth.errors';
import { LoginPipe, RefreshPipe } from '../flow/auth.pipe';
import { Public, Roles } from '../security/auth.decorators';
import { AuthService } from '../service/auth.service';

@Controller('auth')
export class AuthController {
    public constructor(
        private readonly authService: AuthService
    ) { }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    public async login(@Body(LoginPipe) body: LoginDto): Promise<AuthTokensDto> {
        return this.authService.login(body.email, body.password);
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    public async refresh(@Body(RefreshPipe) body: RefreshDto): Promise<AuthTokensDto> {
        return this.authService.newRefresh(body.refreshToken);
    }

    @Roles(Role.USER)
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    public async logout(@Req() request: AuthenticatedRequest): Promise<void> {
        const identity = request.auth;

        if (!identity) {
            throw AUTH_ERRORS.unauthenticated('identity_missing_after_guard');
        }

        await this.authService.logout(identity.userId, identity.sessionId);
    }
}
