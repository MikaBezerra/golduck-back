import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ERRORS } from '../errors/error-catalog';

const ONE_MINUTE_MS = 60_000;
const RATE_LIMIT_KEY = 'security:rateLimit';

interface RateLimitOptions {
    readonly limit: number;
    readonly windowMs: number;
}

interface RateLimitWindow {
    count: number;
    resetAt: number;
}

/**
 * Contadores em memória, por rota e IP, em janelas fixas. Valem por instância da API
 * (com várias instâncias, cada uma conta as suas).
 */
@Injectable()
export class RateLimitStore {
    private readonly windows = new Map<string, RateLimitWindow>();
    private nextSweepAt = 0;

    /** Janela atual da chave, sem contar uma chamada nova (undefined se não houver ou já tiver vencido). */
    public peek(key: string, now: number = Date.now()): Readonly<RateLimitWindow> | undefined {
        const window = this.windows.get(key);

        return window && window.resetAt > now ? window : undefined;
    }

    /** Zera a contagem da chave (ex.: login certo apaga os erros anteriores daquele e-mail). */
    public reset(key: string): void {
        this.windows.delete(key);
    }

    /** Registra uma chamada e devolve a janela atual da chave. */
    public hit(key: string, windowMs: number, now: number = Date.now()): Readonly<RateLimitWindow> {
        this.sweep(now);

        let window = this.windows.get(key);

        if (!window || window.resetAt <= now) {
            window = { count: 0, resetAt: now + windowMs };
            this.windows.set(key, window);
        }

        window.count++;

        return window;
    }

    /** Descarta janelas vencidas, no máximo uma vez por minuto, para a memória não crescer. */
    private sweep(now: number): void {
        if (now < this.nextSweepAt) {
            return;
        }

        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) {
                this.windows.delete(key);
            }
        }

        this.nextSweepAt = now + ONE_MINUTE_MS;
    }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly store: RateLimitStore
    ) { }

    public canActivate(context: ExecutionContext): boolean {
        const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (!options) {
            return true;
        }

        const http = context.switchToHttp();
        const request = http.getRequest<FastifyRequest>();
        const reply = http.getResponse<FastifyReply>();
        const now = Date.now();
        const route = request.routeOptions.url ?? request.url.split('?')[0];
        const window = this.store.hit(`${request.method} ${route} ${request.ip}`, options.windowMs, now);
        const resetSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));

        reply.header('x-ratelimit-limit', options.limit);
        reply.header('x-ratelimit-remaining', Math.max(0, options.limit - window.count));
        reply.header('x-ratelimit-reset', resetSeconds);

        if (window.count > options.limit) {
            throw ERRORS.tooManyRequests(`rate_limit: ${options.limit}/${Math.round(options.windowMs / 1000)}s`, resetSeconds);
        }

        return true;
    }
}

/**
 * Limita quantas vezes o mesmo IP pode chamar a rota dentro da janela.
 * Ao estourar, a API responde 429 com o código TOO_MANY_REQUESTS e o header Retry-After (segundos);
 * toda resposta da rota traz x-ratelimit-limit, x-ratelimit-remaining e x-ratelimit-reset.
 *
 * Atrás de proxy, configure TRUST_PROXY para o IP considerado ser o do cliente, e não o do proxy.
 *
 * @example
 * ```ts
 * @RateLimit(5)              // 5 por minuto
 * @RateLimit(100, 3_600_000) // 100 por hora
 * ```
 */
export function RateLimit(limit: number, windowMs: number = ONE_MINUTE_MS): MethodDecorator & ClassDecorator {
    return applyDecorators(
        SetMetadata(RATE_LIMIT_KEY, { limit, windowMs } satisfies RateLimitOptions),
        UseGuards(RateLimitGuard),
        ApiTooManyRequestsResponse({ description: 'Muitas tentativas; veja o header Retry-After' })
    );
}
