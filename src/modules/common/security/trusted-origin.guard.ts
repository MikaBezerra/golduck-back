import type { Config } from '../model';
import { applyDecorators, CanActivate, ExecutionContext, Inject, Injectable, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Service } from '../../tokens';
import { ERRORS } from '../errors/error-catalog';

/** Origem normalizada (protocolo + domínio + porta, sem a porta padrão) ou null se não for http(s). */
function normalizeOrigin(value: string): string | null {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
    } catch {
        return null;
    }
}

/**
 * A origem é confiável quando está em API_CORS_ORIGINS (o front) ou quando é a própria API
 * (Swagger em /docs, ou front e API servidos no mesmo domínio).
 */
export function isTrustedOrigin(origin: string, request: FastifyRequest, allowedOrigins: readonly string[]): boolean {
    const normalized = normalizeOrigin(origin);

    if (normalized === null) {
        return false;
    }

    return allowedOrigins.includes(normalized)
        || normalized === normalizeOrigin(`${request.protocol}://${request.host}`);
}

/**
 * Proteção contra CSRF nas rotas que usam cookie: o navegador manda o cookie sozinho, até numa
 * chamada disparada por outro site. Por isso, se a requisição traz o header Origin, ele precisa
 * ser de uma origem confiável; senão a resposta é 403 FORBIDDEN.
 * Sem Origin (curl, apps, servidores) a requisição passa: não é um navegador agindo por outro site.
 */
@Injectable()
export class TrustedOriginGuard implements CanActivate {
    public constructor(
        @Inject(Service.CONFIG)
        private readonly config: Config
    ) { }

    public canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const origin = request.headers.origin;

        if (origin === undefined || isTrustedOrigin(origin, request, this.config.API_CORS_ORIGINS ?? [])) {
            return true;
        }

        throw ERRORS.forbidden(`origin_not_allowed: ${origin}`);
    }
}

/** Aplica o TrustedOriginGuard na rota (ou em todas as rotas do controller). */
export function TrustedOrigin(): MethodDecorator & ClassDecorator {
    return applyDecorators(
        UseGuards(TrustedOriginGuard),
        ApiForbiddenResponse({ description: 'Origem não permitida (FORBIDDEN)' })
    );
}
