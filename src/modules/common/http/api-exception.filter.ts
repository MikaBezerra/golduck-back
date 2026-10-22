import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../errors/app-error';
import type { ApiErrorResponse } from './response.types';

const HTTP_MESSAGES: Partial<Record<HttpStatus, string>> = {
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
            : HTTP_MESSAGES[statusCode as HttpStatus] ?? (statusCode >= 500 ? 'Erro interno do servidor' : 'Não foi possível processar a requisição');
        const response: ApiErrorResponse = {
            error: { code, message, requestId: request.id }
        };

        reply.status(statusCode).send(response);
    }
}
