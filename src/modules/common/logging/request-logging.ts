import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { LoggerService } from '../provider/logger.service';
import { getAppInfo } from './app-info';
import { LogSettings, readLogSettings } from './log-settings';
import { QUIET_REQUEST_LOG } from './quiet-request-log.decorator';
import { APP_VERSION_HEADER, REQUEST_ID_HEADER } from './request-id';
import { RequestLogContext } from './request-log.context';
import { sanitizeForLog } from './sanitize';

type IdentifiedRequest = FastifyRequest & {
    auth?: { userId: string; email?: string; role?: string };
};

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Registra uma linha de log por requisição, ao final da resposta, com:
 * id, método, rota, caminho, query, status, duração, IP, user agent, usuário, código e motivo
 * do erro, detalhes de validação, pilha (5xx) e, conforme LOG_REQUEST_BODY, o corpo (sem senhas/tokens).
 *
 * Níveis: 5xx = error; 4xx (exceto 401) e requisições lentas = warn; rotas com @QuietRequestLog() = debug;
 * o resto = info. Também devolve os headers x-request-id e x-app-version em toda resposta.
 */
export function registerRequestLogging(
    fastify: FastifyInstance,
    logger: LoggerService,
    context: RequestLogContext,
    settings: LogSettings = readLogSettings()
): void {
    const { version } = getAppInfo();

    fastify.addHook('onRequest', (request, reply, done) => {
        context.start(request);
        reply.header(REQUEST_ID_HEADER, request.id);
        reply.header(APP_VERSION_HEADER, version);
        done();
    });

    fastify.addHook('onResponse', (request, reply, done) => {
        const { durationMs, failure } = context.finish(request);
        const statusCode = reply.statusCode;
        const auth = (request as IdentifiedRequest).auth;
        const slow = durationMs >= settings.slowRequestMs;
        const logData = {
            requestId: request.id,
            method: request.method,
            route: request.routeOptions.url,
            path: request.url.split('?')[0],
            query: hasEntries(request.query) ? sanitizeForLog(request.query) : undefined,
            statusCode,
            durationMs,
            slow: slow || undefined,
            responseBytes: responseBytes(reply),
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            userId: auth?.userId,
            userEmail: auth?.email,
            role: auth?.role,
            code: failure?.code ?? (statusCode >= 400 ? `HTTP_${statusCode}` : undefined),
            reason: failure?.reason,
            details: failure?.details === undefined ? undefined : sanitizeForLog(failure.details),
            errorName: failure?.errorName,
            errorMessage: failure?.errorMessage,
            stack: failure?.stack,
            body: shouldLogBody(request, statusCode, settings) ? sanitizeForLog(request.body) : undefined
        };

        if (statusCode >= 500) {
            logger.error('Requisição concluída com falha', logData);
        } else if (statusCode >= 400 && statusCode !== 401) {
            logger.warn('Requisição rejeitada', logData);
        } else if (slow) {
            logger.warn('Requisição lenta', logData);
        } else if (isQuiet(request)) {
            logger.debug('Requisição concluída', logData);
        } else {
            logger.info('Requisição concluída', logData);
        }

        done();
    });
}

function hasEntries(value: unknown): boolean {
    return value !== null && typeof value === 'object' && Object.keys(value).length > 0;
}

function responseBytes(reply: FastifyReply): number | undefined {
    const length = Number(reply.getHeader('content-length'));

    return Number.isFinite(length) && length > 0 ? length : undefined;
}

function isQuiet(request: FastifyRequest): boolean {
    const config = request.routeOptions.config as unknown as Record<string, unknown> | undefined;

    return config?.[QUIET_REQUEST_LOG] === true;
}

/** Nunca registra uploads (multipart): o arquivo não passa pelo corpo e pode conter dados sensíveis. */
function shouldLogBody(request: FastifyRequest, statusCode: number, settings: LogSettings): boolean {
    if (settings.requestBody === 'off' || !METHODS_WITH_BODY.has(request.method)) {
        return false;
    }

    const contentType = request.headers['content-type'] ?? '';

    if (request.body === undefined || request.body === null || contentType.startsWith('multipart/')) {
        return false;
    }

    return settings.requestBody === 'all' || statusCode >= 400;
}
