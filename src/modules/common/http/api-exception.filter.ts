import type { ApiErrorResponse } from './response.types';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../errors/app-error';
import { RequestLogContext } from '../logging/request-log.context';
import { ValidationError } from '../validation/validation-error';

const HTTP_MESSAGES: Partial<Record<number, string>> = {
    [HttpStatus.BAD_REQUEST]: 'Requisição inválida',
    [HttpStatus.UNAUTHORIZED]: 'Autenticação necessária',
    [HttpStatus.FORBIDDEN]: 'Acesso negado',
    [HttpStatus.NOT_FOUND]: 'Recurso não encontrado',
    [HttpStatus.CONFLICT]: 'Conflito ao processar a requisição',
    [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas requisições',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'Serviço indisponível'
};

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
        const code = exception instanceof AppError ? exception.code : `HTTP_${statusCode}`;
        const message = exception instanceof AppError
            ? exception.publicMessage
            : HTTP_MESSAGES[statusCode] ?? (statusCode >= 500 ? 'Erro interno do servidor' : 'Não foi possível processar a requisição');
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
            ...(statusCode >= 500 && exception instanceof Error ? {
                errorName: exception.name,
                errorMessage: exception.message,
                stack: exception.stack
            } : {})
        });

        reply.status(statusCode).send(response);
    }
}
