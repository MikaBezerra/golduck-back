import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

const ONE_MINUTE_MS = 60_000;

/**
 * Limita quantas vezes o mesmo IP pode chamar a rota dentro da janela.
 * Ao estourar, a API responde 429 com o código TOO_MANY_REQUESTS e o header Retry-After (segundos).
 *
 * Os contadores ficam em memória: valem por instância da API. Atrás de proxy, configure
 * TRUST_PROXY para o IP considerado ser o do cliente, e não o do proxy.
 *
 * @example
 * ```ts
 * @RateLimit(5)            // 5 por minuto
 * @RateLimit(100, 3_600_000) // 100 por hora
 * ```
 */
export function RateLimit(limit: number, windowMs: number = ONE_MINUTE_MS): MethodDecorator & ClassDecorator {
    return applyDecorators(
        UseGuards(ThrottlerGuard),
        Throttle({ default: { limit, ttl: windowMs } }),
        ApiTooManyRequestsResponse({ description: 'Muitas tentativas; veja o header Retry-After' })
    );
}
