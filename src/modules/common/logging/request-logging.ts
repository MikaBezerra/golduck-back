import type { FastifyInstance, FastifyRequest } from 'fastify';

import { LoggerService } from '../provider/logger.service';
import { RequestLogContext } from './request-log.context';

type IdentifiedRequest = FastifyRequest & { auth?: { userId: string } };

export function registerRequestLogging(
    fastify: FastifyInstance,
    logger: LoggerService,
    context: RequestLogContext
): void {
    fastify.addHook('onRequest', (request, reply, done) => {
        context.start(request);
        reply.header('x-request-id', request.id);
        done();
    });

    fastify.addHook('onResponse', (request, reply, done) => {
        const { durationMs, failure } = context.finish(request);
        const statusCode = reply.statusCode;
        const logData = {
            requestId: request.id,
            method: request.method,
            path: request.routeOptions.url ?? request.url.split('?')[0],
            statusCode,
            durationMs,
            userId: (request as IdentifiedRequest).auth?.userId,
            code: failure?.code ?? (statusCode >= 400 ? `HTTP_${statusCode}` : undefined),
            reason: failure?.reason,
            errorName: failure?.errorName,
            errorMessage: failure?.errorMessage,
            stack: failure?.stack
        };

        if (statusCode >= 500) {
            logger.error('Requisição concluída com falha', logData);
        } else if (statusCode >= 400 && statusCode !== 401) {
            logger.warn('Requisição rejeitada', logData);
        } else {
            logger.info('Requisição concluída', logData);
        }

        done();
    });
}
