import { Injectable } from '@nestjs/common';

import { AuthUserResponse } from '../dto/auth.dto';
import { AUTH_ERRORS } from '../errors/auth.errors';
import { AuthRepository } from '../repository/auth.repository';
import { AccessTokenService } from '../security/access-token.service';
import { LoginAttemptsService } from '../security/login-attempts.service';
import { PasswordService } from '../security/password.service';
import { REFRESH_TOKEN_TTL_MS, RefreshTokenService, SESSION_MAX_AGE_MS } from '../security/refresh-token.service';

export interface AuthTokens {
    readonly accessToken: string;
    readonly refreshToken: string;
    /** Até quando o refresh token vale (define o Max-Age do cookie). */
    readonly refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
    public constructor(
        private readonly repository: AuthRepository,
        private readonly passwordService: PasswordService,
        private readonly refreshTokenService: RefreshTokenService,
        private readonly accessTokenService: AccessTokenService,
        private readonly loginAttempts: LoginAttemptsService
    ) { }

    /**
     * Confere e-mail e senha e abre uma sessão.
     *
     * - e-mail com erros demais na janela: 429 antes de olhar a senha;
     * - a senha é sempre comparada (com um hash descartável se o e-mail não existir), para o tempo
     *   de resposta não revelar quais e-mails têm conta;
     * - qualquer falha responde a mesma mensagem e conta um erro para o e-mail; acertar zera os erros.
     */
    public async login(email: string, password: string): Promise<AuthTokens> {
        this.loginAttempts.assertAllowed(email);

        const user = await this.repository.findUserByEmail(email);
        const passwordCorrect = user
            ? await this.passwordService.verifyPassword(password, user.hash)
            : await this.passwordService.verifyAgainstDummy(password);

        if (!user || !user.active) {
            this.loginAttempts.registerFailure(email);
            throw AUTH_ERRORS.invalidCredentials('user_missing_or_inactive');
        }

        if (!passwordCorrect) {
            this.loginAttempts.registerFailure(email);
            throw AUTH_ERRORS.invalidCredentials('password_mismatch');
        }

        this.loginAttempts.reset(email);

        const refresh = this.refreshTokenService.generate();
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

        await this.repository.createSession(
            refresh.sessionId,
            user.id,
            refresh.tokenHash,
            expiresAt
        );

        return {
            accessToken: this.accessTokenService.generate(user.id, refresh.sessionId),
            refreshToken: refresh.token,
            refreshExpiresAt: expiresAt
        };
    }

    public async newRefresh(refreshToken: string): Promise<AuthTokens> {
        const parsed = this.refreshTokenService.parse(refreshToken);

        if (!parsed) {
            throw AUTH_ERRORS.invalidSession('refresh_malformed');
        }

        const session = await this.repository.findSessionById(parsed.sessionId);

        if (!session ||
            session.revokedAt !== null ||
            session.expiresAt.getTime() <= Date.now()
        ) {
            throw AUTH_ERRORS.invalidSession('session_missing_revoked_or_expired');
        }

        const user = await this.repository.findByUserId(session.userId);

        if (!user || !user.active) {
            throw AUTH_ERRORS.invalidSession('user_missing_or_inactive');
        }

        // A renovação estende a sessão por mais 7 dias, mas nunca além de 30 dias desde o login.
        const now = Date.now();
        const maxExpiresAt = session.createdAt.getTime() + SESSION_MAX_AGE_MS;

        if (maxExpiresAt <= now) {
            await this.repository.revokeSession(session.id, user.id);
            throw AUTH_ERRORS.invalidSession('session_max_age_reached');
        }

        const nextRefresh = this.refreshTokenService.generate(session.id);
        const nextExpiresAt = new Date(Math.min(now + REFRESH_TOKEN_TTL_MS, maxExpiresAt));

        const rotated = await this.repository.rotateSession(
            session.id,
            parsed.tokenHash,
            nextRefresh.tokenHash,
            nextExpiresAt
        );

        if (!rotated) {
            await this.repository.revokeSession(session.id, user.id);
            throw AUTH_ERRORS.invalidSession('refresh_reuse_or_race');
        }

        return {
            accessToken: this.accessTokenService.generate(user.id, session.id),
            refreshToken: nextRefresh.token,
            refreshExpiresAt: nextExpiresAt
        };
    }

    /**
     * Encerra a sessão do refresh token (cookie) e a do access token (Bearer), se vierem.
     * O access token pode estar vencido: a assinatura é conferida, a validade não.
     * Não falha se não houver sessão a encerrar, para "sair" sempre funcionar no front.
     */
    public async logout(credentials: { refreshToken?: string; accessToken?: string }): Promise<void> {
        const sessions = new Map<string, string>();
        const parsed = credentials.refreshToken ? this.refreshTokenService.parse(credentials.refreshToken) : null;

        if (parsed) {
            const session = await this.repository.findSessionById(parsed.sessionId);

            // Só o cookie verdadeiro encerra a sessão: um id de sessão com um segredo inventado não derruba
            // a sessão de outra pessoa. Mesmo assim o logout não falha (o cookie é apagado de qualquer jeito).
            if (session && session.tokenHash === parsed.tokenHash) {
                sessions.set(session.id, session.userId);
            }
        }

        const identity = credentials.accessToken
            ? this.accessTokenService.verify(credentials.accessToken, { ignoreExpiration: true })
            : null;

        if (identity) {
            sessions.set(identity.sessionId, identity.userId);
        }

        await Promise.all(
            [...sessions].map(async ([sessionId, userId]) => this.repository.revokeSession(sessionId, userId))
        );
    }

    /** Dados públicos do usuário autenticado; nunca inclui o hash da senha. */
    public async me(userId: string): Promise<AuthUserResponse> {
        const user = await this.repository.findByUserId(userId);

        if (!user || !user.active) {
            throw AUTH_ERRORS.unauthenticated('user_missing_or_inactive');
        }

        return {
            id: user.id,
            email: user.email,
            role: user.role
        };
    }
}
