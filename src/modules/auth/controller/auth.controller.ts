import type { AuthenticatedRequest } from '../security/jwt-auth.guard';
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { AuthTokensDto, AuthUserResponse, LoginDto, RefreshDto } from '../dto/auth.dto';
import { AUTH_ERRORS } from '../errors/auth.errors';
import { LoginPipe, RefreshPipe } from '../flow/auth.pipe';
import { Public, Roles } from '../security/auth.decorators';
import { AuthService } from '../service/auth.service';

@ApiTags('auth')
@ApiErrorResponses()
@Controller('auth')
export class AuthController {
    public constructor(
        private readonly authService: AuthService
    ) { }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Entra com e-mail e senha' })
    @ApiDataResponse(AuthTokensDto)
    public async login(@Body(LoginPipe) body: LoginDto): Promise<AuthTokensDto> {
        return this.authService.login(body.email, body.password);
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Troca o refresh token por um novo par de tokens' })
    @ApiDataResponse(AuthTokensDto)
    public async refresh(@Body(RefreshPipe) body: RefreshDto): Promise<AuthTokensDto> {
        return this.authService.newRefresh(body.refreshToken);
    }

    @Roles(Role.USER)
    @Get('me')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Usuário do token' })
    @ApiDataResponse(AuthUserResponse)
    public async me(@Req() request: AuthenticatedRequest): Promise<AuthUserResponse> {
        const identity = request.auth;

        if (!identity) {
            throw AUTH_ERRORS.unauthenticated('identity_missing_after_guard');
        }

        return this.authService.me(identity.userId);
    }

    @Roles(Role.USER)
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Encerra a sessão do access token enviado' })
    @ApiNoContentResponse({ description: 'Sessão encerrada' })
    public async logout(@Req() request: AuthenticatedRequest): Promise<void> {
        const identity = request.auth;

        if (!identity) {
            throw AUTH_ERRORS.unauthenticated('identity_missing_after_guard');
        }

        await this.authService.logout(identity.userId, identity.sessionId);
    }
}
