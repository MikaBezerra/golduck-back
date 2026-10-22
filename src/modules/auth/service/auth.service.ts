import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthRepository } from '../repository/auth.repository';
import { AccessTokenService } from '../security/access-token.service';
import { PasswordService } from '../security/password.service';
import { RefreshTokenService } from '../security/refresh-token.service';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const passwordCorrect = await this.passwordService.verifyPassword(password, user.hash);

        if (!passwordCorrect) {
            throw new UnauthorizedException('Credenciais inválidas');
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
            throw new UnauthorizedException('Sessão inválida');
        }

        const session = await this.repository.findSessionById(parsed.sessionId);

        if (!session ||
            session.revokedAt !== null ||
            session.expiresAt.getTime() <= Date.now()
        ) {
            throw new UnauthorizedException('Sessão inválida');
        }

        const user = await this.repository.findByUserId(session.userId);

        if (!user || !user.active) {
            throw new UnauthorizedException('Sessão inválida');
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
            throw new UnauthorizedException('Sessão inválida');
        }

        return {
            accessToken: this.accessTokenService.generate(user.id, session.id),
            refreshToken: nextRefresh.token
        };
    }

    public async logout(userId: string, sessionId: string): Promise<void> {
        await this.repository.revokeSession(sessionId, userId);
    }
}
