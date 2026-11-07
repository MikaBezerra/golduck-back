import { Injectable } from '@nestjs/common';

import { AuthUserResponse } from '../dto/auth.dto';
import { AUTH_ERRORS } from '../errors/auth.errors';
import { AuthRepository } from '../repository/auth.repository';
import { AccessTokenService } from '../security/access-token.service';
import { PasswordService } from '../security/password.service';
import { REFRESH_TOKEN_TTL_MS, RefreshTokenService } from '../security/refresh-token.service';

export interface AuthTokens {
    readonly accessToken: string;
    readonly refreshToken: string;
}

@Injectable()
export class AuthService {
    public constructor(
        private readonly repository: AuthRepository,
        private readonly passwordService: PasswordService,
        private readonly refreshTokenService: RefreshTokenService,
        private readonly accessTokenService: AccessTokenService,
    ) { }

    public async login(email: string, password: string): Promise<AuthTokens> {
        const user = await this.repository.findUserByEmail(email);

        if (!user || !user.active) {
            throw AUTH_ERRORS.invalidCredentials('user_missing_or_inactive');
        }

        const passwordCorrect = await this.passwordService.verifyPassword(password, user.hash);

        if (!passwordCorrect) {
            throw AUTH_ERRORS.invalidCredentials('password_mismatch');
        }

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
            refreshToken: refresh.token
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

        const nextRefresh = this.refreshTokenService.generate(session.id);
        const nextExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

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
            refreshToken: nextRefresh.token
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

            if (session) {
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
