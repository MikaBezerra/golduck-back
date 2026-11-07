import type { ApiErrorResponse } from './response.types';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../errors/app-error';
import { RequestLogContext } from '../logging/request-log.context';
import { ValidationError } from '../validation/validation-error';

/**
 * Código e mensagem para exceções HTTP que não nasceram de um AppError
 * (rota inexistente, corpo grande demais, limite de tentativas etc.).
 */
const HTTP_ERRORS: Partial<Record<number, { code: string; message: string }>> = {
    [HttpStatus.BAD_REQUEST]: { code: 'BAD_REQUEST', message: 'Requisição inválida' },
    [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHENTICATED', message: 'Autenticação necessária' },
    [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Acesso negado' },
    [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'Recurso não encontrado' },
    [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: 'Conflito ao processar a requisição' },
    [HttpStatus.PAYLOAD_TOO_LARGE]: { code: 'PAYLOAD_TOO_LARGE', message: 'Conteúdo maior que o permitido' },
    [HttpStatus.TOO_MANY_REQUESTS]: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Aguarde um pouco e tente novamente.' },
    [HttpStatus.SERVICE_UNAVAILABLE]: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço indisponível' }
};

const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' };

function describeHttpError(statusCode: number): { code: string; message: string } {
    return HTTP_ERRORS[statusCode]
        ?? (statusCode >= 500
            ? INTERNAL_ERROR
            : { code: `HTTP_${statusCode}`, message: 'Não foi possível processar a requisição' });
}

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
    public constructor(private readonly requestLogContext: RequestLogContext) {}

    public catch(exception: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const request = http.getRequest<FastifyRequest>();
        const reply = http.getResponse<FastifyReply>();
        const statusCode = exception instanceof AppError
            ? exception.statusCode
            : exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;
        const { code, message } = exception instanceof AppError
            ? { code: exception.code, message: exception.publicMessage }
            : describeHttpError(statusCode);
        const response: ApiErrorResponse = {
            error: {
                code,
                message,
                requestId: request.id,
                ...(exception instanceof ValidationError ? { details: exception.details } : {})
            }
        };

        this.requestLogContext.recordFailure(request, {
            code,
            ...(exception instanceof AppError && exception.reason ? { reason: exception.reason } : {}),
            // Ex.: "Cannot GET /api/xyz".
            ...(!(exception instanceof AppError) && exception instanceof HttpException && statusCode < 500
                ? { reason: exception.message }
                : {}),
            ...(exception instanceof ValidationError ? { details: exception.details } : {}),
            ...(statusCode >= 500 && exception instanceof Error ? {
                errorName: exception.name,
                errorMessage: exception.message,
                stack: exception.stack
            } : {})
        });

        reply.status(statusCode).send(response);
    }
}
