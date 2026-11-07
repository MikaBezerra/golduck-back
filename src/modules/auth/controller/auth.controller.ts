import type { AuthenticatedRequest } from '../security/jwt-auth.guard';
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Role } from '../../../generated/prisma/client';
import { AppError } from '../../common/errors/app-error';
import { RateLimit, TrustedOrigin } from '../../common/security';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { AuthTokensDto, AuthUserResponse, LoginDto } from '../dto/auth.dto';
import { AUTH_ERRORS } from '../errors/auth.errors';
import { LoginPipe } from '../flow/auth.pipe';
import { Public, Roles } from '../security/auth.decorators';
import { readBearerToken } from '../security/jwt-auth.guard';
import { RefreshCookieService } from '../security/refresh-cookie.service';
import { AuthService } from '../service/auth.service';

const INVALID_SESSION_CODE = AUTH_ERRORS.invalidSession().code;

/**
 * Sessão em dois tokens:
 * - access token (JWT, 15 min) no corpo da resposta; o front guarda em memória e envia como Bearer;
 * - refresh token (7 dias, de uso único) só no cookie httpOnly, gravado e lido pela API.
 *
 * As rotas que mexem no cookie exigem origem confiável (@TrustedOrigin) contra CSRF.
 */
@ApiTags('auth')
@ApiErrorResponses()
@Controller('auth')
export class AuthController {
    public constructor(
        private readonly authService: AuthService,
        private readonly refreshCookie: RefreshCookieService
    ) { }

    @Public()
    @RateLimit(5)
    @TrustedOrigin()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Entra com e-mail e senha',
        description: 'Devolve o access token e grava o refresh token no cookie httpOnly (Path=/api/auth).'
    })
    @ApiDataResponse(AuthTokensDto)
    public async login(
        @Body(LoginPipe) body: LoginDto,
        @Res({ passthrough: true }) reply: FastifyReply
    ): Promise<AuthTokensDto> {
        const tokens = await this.authService.login(body.email, body.password);

        this.refreshCookie.set(reply, tokens.refreshToken, tokens.refreshExpiresAt);

        return { accessToken: tokens.accessToken };
    }

    @Public()
    @RateLimit(20)
    @TrustedOrigin()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiCookieAuth()
    @ApiOperation({
        summary: 'Gera um novo access token a partir do cookie',
        description: 'Sem corpo. Lê o refresh token do cookie, troca por um novo (rotação) e grava o novo cookie. '
            + 'Reusar um refresh token antigo encerra a sessão. Sessão inválida: 401 AUTH_INVALID_SESSION e o cookie é apagado.'
    })
    @ApiDataResponse(AuthTokensDto)
    public async refresh(
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply
    ): Promise<AuthTokensDto> {
        try {
            const refreshToken = this.refreshCookie.read(request);

            if (!refreshToken) {
                throw AUTH_ERRORS.invalidSession('refresh_cookie_missing');
            }

            const tokens = await this.authService.newRefresh(refreshToken);
            this.refreshCookie.set(reply, tokens.refreshToken, tokens.refreshExpiresAt);

            return { accessToken: tokens.accessToken };
        } catch (error) {
            // Cookie que não serve mais: apaga para o navegador parar de enviá-lo.
            if (error instanceof AppError && error.code === INVALID_SESSION_CODE) {
                this.refreshCookie.clear(reply);
            }

            throw error;
        }
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

    @Public()
    @TrustedOrigin()
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiCookieAuth()
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Encerra a sessão',
        description: 'Encerra a sessão do cookie e/ou do Bearer (mesmo vencido) e apaga o cookie. Sempre responde 204.'
    })
    @ApiNoContentResponse({ description: 'Sessão encerrada e cookie apagado' })
    public async logout(
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply
    ): Promise<void> {
        try {
            await this.authService.logout({
                refreshToken: this.refreshCookie.read(request),
                accessToken: readBearerToken(request)
            });
        } finally {
            this.refreshCookie.clear(reply);
        }
    }
}
