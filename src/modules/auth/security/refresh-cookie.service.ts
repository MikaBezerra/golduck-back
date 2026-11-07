import type { Config } from '../../common';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { Service } from '../../tokens';

const DEFAULT_API_PREFIX = '/api';

/**
 * Cookie httpOnly que guarda o refresh token. O JavaScript do front não consegue lê-lo (só o
 * navegador o envia), o que protege o token contra XSS.
 *
 * - HttpOnly e Secure sempre; os navegadores aceitam Secure em http://localhost;
 * - Path = <prefixo>/auth: só vai nas rotas de autenticação, não em toda chamada à API;
 * - Max-Age = tempo até a sessão vencer (7 dias, renovados a cada refresh, até 30 dias desde o login);
 * - SameSite e Domain vêm de AUTH_COOKIE_SAMESITE e AUTH_COOKIE_DOMAIN.
 */
@Injectable()
export class RefreshCookieService {
    public constructor(
        @Inject(Service.CONFIG)
        private readonly config: Config
    ) { }

    public get name(): string {
        return this.config.AUTH_COOKIE_NAME;
    }

    public read(request: FastifyRequest): string | undefined {
        const value = request.cookies[this.name];

        return value ? value : undefined;
    }

    public set(reply: FastifyReply, refreshToken: string, expiresAt: Date): void {
        reply.setCookie(this.name, refreshToken, {
            ...this.options(),
            maxAge: Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000))
        });
    }

    /** Apaga o cookie no navegador (mesmos atributos, Max-Age=0). */
    public clear(reply: FastifyReply): void {
        reply.setCookie(this.name, '', {
            ...this.options(),
            maxAge: 0,
            expires: new Date(0)
        });
    }

    private options(): CookieSerializeOptions {
        const prefix = `/${(this.config.API_PREFIX || DEFAULT_API_PREFIX).replace(/^\/+|\/+$/g, '')}`;

        return {
            httpOnly: true,
            secure: true,
            sameSite: this.config.AUTH_COOKIE_SAMESITE,
            path: `${prefix === '/' ? '' : prefix}/auth`,
            ...(this.config.AUTH_COOKIE_DOMAIN ? { domain: this.config.AUTH_COOKIE_DOMAIN } : {})
        };
    }
}
