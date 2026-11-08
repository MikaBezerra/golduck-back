import type { RequestFailure } from '../../logging/request-log.context.js';
import { jest } from '@jest/globals';
import type { ArgumentsHost } from '@nestjs/common';
import {
    BadGatewayException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
    NotFoundException,
    PayloadTooLargeException,
    ServiceUnavailableException,
    UnauthorizedException
} from '@nestjs/common';

import { AppError } from '../../errors/app-error.js';
import { ERRORS } from '../../errors/error-catalog.js';
import { ApiExceptionFilter } from '../../http/api-exception.filter.js';
import { RequestLogContext } from '../../logging/request-log.context.js';
import { ValidationError } from '../../validation/validation-error.js';

/**
 * Filtro de erros direto, com request/reply falsos: o corpo { error } devolvido, o status, os
 * headers do AppError e o que fica registrado para o log da requisição (recordFailure).
 */
describe('ApiExceptionFilter', () => {
    const request = { id: 'req-123' };
    let reply: {
        headers: jest.Mock<(values: Record<string, string>) => unknown>;
        status: jest.Mock<(code: number) => unknown>;
        send: jest.Mock<(body: unknown) => unknown>;
    };
    let recordFailure: jest.Mock<(request: unknown, failure: RequestFailure) => void>;
    let filter: ApiExceptionFilter;

    const host = (): ArgumentsHost => ({
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply })
    }) as unknown as ArgumentsHost;

    /** Trata a exceção e devolve o status, o corpo enviado e a falha registrada para o log. */
    const handle = (exception: unknown): { status: number; body: unknown; failure: RequestFailure } => {
        filter.catch(exception, host());

        expect(reply.status).toHaveBeenCalledTimes(1);
        expect(reply.send).toHaveBeenCalledTimes(1);
        expect(recordFailure).toHaveBeenCalledTimes(1);
        expect(recordFailure.mock.calls[0][0]).toBe(request);

        return { status: reply.status.mock.calls[0][0], body: reply.send.mock.calls[0][0], failure: recordFailure.mock.calls[0][1] };
    };

    beforeEach(() => {
        reply = { headers: jest.fn(), status: jest.fn(), send: jest.fn() };
        reply.headers.mockReturnValue(reply);
        reply.status.mockReturnValue(reply);
        recordFailure = jest.fn();
        filter = new ApiExceptionFilter({ recordFailure } as unknown as RequestLogContext);
    });

    describe('AppError', () => {
        it('usa código, status e mensagem pública do erro; o motivo vai só para o log', () => {
            const { status, body, failure } = handle(new AppError('PERSON_NOT_FOUND', 404, 'Pessoa não encontrada', 'person_missing'));

            expect(status).toBe(404);
            expect(body).toEqual({ error: { code: 'PERSON_NOT_FOUND', message: 'Pessoa não encontrada', requestId: 'req-123' } });
            expect(failure).toEqual({ code: 'PERSON_NOT_FOUND', reason: 'person_missing' });
        });

        it('sem motivo, o log fica só com o código', () => {
            const { failure } = handle(new AppError('CONFLICT', 409, 'Conflito'));

            expect(failure).toEqual({ code: 'CONFLICT' });
        });

        it('envia os headers extras do erro (ex.: Retry-After no 429) antes do corpo', () => {
            const { status } = handle(ERRORS.tooManyRequests('login_rate_limited', 30));

            expect(status).toBe(429);
            expect(reply.headers).toHaveBeenCalledWith({ 'retry-after': '30' });
            expect(reply.headers.mock.invocationCallOrder[0]).toBeLessThan(reply.send.mock.invocationCallOrder[0]);
        });

        it('AppError 500: a mensagem pública vai para o cliente e nome, mensagem e pilha para o log', () => {
            const error = new AppError('IMPORT_FAILED', 500, 'Falha ao importar', 'parser_crashed');

            const { status, body, failure } = handle(error);

            expect(status).toBe(500);
            expect(body).toEqual({ error: { code: 'IMPORT_FAILED', message: 'Falha ao importar', requestId: 'req-123' } });
            expect(failure).toEqual({
                code: 'IMPORT_FAILED',
                reason: 'parser_crashed',
                errorName: 'AppError',
                errorMessage: 'Falha ao importar',
                stack: error.stack
            });
        });
    });

    it('ValidationError: 400 com os detalhes no corpo e no log', () => {
        const details = [{ field: 'name', code: 'any.required', message: 'name é obrigatório' }];

        const { status, body, failure } = handle(new ValidationError(details));

        expect(status).toBe(400);
        expect(body).toEqual({
            error: { code: 'VALIDATION_ERROR', message: 'Os dados enviados são inválidos', requestId: 'req-123', details }
        });
        expect(failure).toEqual({ code: 'VALIDATION_ERROR', details });
        expect(reply.headers).toHaveBeenCalledWith({});
    });

    describe('HttpException do Nest', () => {
        it.each([
            [new BadRequestException('corpo quebrado'), 400, 'BAD_REQUEST', 'Requisição inválida'],
            [new UnauthorizedException('sem token'), 401, 'UNAUTHENTICATED', 'Autenticação necessária'],
            [new ForbiddenException('sem papel'), 403, 'FORBIDDEN', 'Acesso negado'],
            [new NotFoundException('Cannot GET /api/xyz'), 404, 'NOT_FOUND', 'Recurso não encontrado'],
            [new ConflictException('repetido'), 409, 'CONFLICT', 'Conflito ao processar a requisição'],
            [new PayloadTooLargeException('grande'), 413, 'PAYLOAD_TOO_LARGE', 'Conteúdo maior que o permitido'],
            [new HttpException('devagar', HttpStatus.TOO_MANY_REQUESTS), 429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde um pouco e tente novamente.']
        ])('%s vira %s %s com mensagem própria; a mensagem original vai só para o log', (exception, statusCode, code, message) => {
            const { status, body, failure } = handle(exception);

            expect(status).toBe(statusCode);
            expect(body).toEqual({ error: { code, message, requestId: 'req-123' } });
            expect(failure).toEqual({ code, reason: exception.message });
            expect(reply.headers).not.toHaveBeenCalled();
        });

        it('status 4xx sem tradução vira HTTP_<status> com mensagem genérica', () => {
            const { status, body, failure } = handle(new HttpException('Método não permitido', HttpStatus.METHOD_NOT_ALLOWED));

            expect(status).toBe(405);
            expect(body).toEqual({
                error: { code: 'HTTP_405', message: 'Não foi possível processar a requisição', requestId: 'req-123' }
            });
            expect(failure).toEqual({ code: 'HTTP_405', reason: 'Método não permitido' });
        });

        it('503 tem código próprio e registra nome, mensagem e pilha (sem reason)', () => {
            const exception = new ServiceUnavailableException('banco fora');

            const { status, body, failure } = handle(exception);

            expect(status).toBe(503);
            expect(body).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço indisponível', requestId: 'req-123' } });
            expect(failure).toEqual({
                code: 'SERVICE_UNAVAILABLE',
                errorName: 'ServiceUnavailableException',
                errorMessage: 'banco fora',
                stack: exception.stack
            });
        });

        it.each([
            [new InternalServerErrorException('quebrou'), 500],
            [new BadGatewayException('upstream'), 502]
        ])('5xx sem tradução (%s) vira INTERNAL_ERROR, mantendo o status', (exception, statusCode) => {
            const { status, body, failure } = handle(exception);

            expect(status).toBe(statusCode);
            expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', requestId: 'req-123' } });
            expect(failure).toEqual({ code: 'INTERNAL_ERROR', errorName: exception.name, errorMessage: exception.message, stack: exception.stack });
        });
    });

    describe('erro inesperado', () => {
        it('Error comum: 500 genérico para o cliente, sem vazar a mensagem; detalhes completos no log', () => {
            const error = new TypeError('senha do banco: 123');

            const { status, body, failure } = handle(error);

            expect(status).toBe(500);
            expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', requestId: 'req-123' } });
            expect(JSON.stringify(body)).not.toContain('senha');
            expect(failure).toEqual({ code: 'INTERNAL_ERROR', errorName: 'TypeError', errorMessage: 'senha do banco: 123', stack: error.stack });
            expect(reply.headers).not.toHaveBeenCalled();
        });

        it('algo lançado que não é Error: 500 e o log só com o código', () => {
            const { status, body, failure } = handle('falhou');

            expect(status).toBe(500);
            expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', requestId: 'req-123' } });
            expect(failure).toEqual({ code: 'INTERNAL_ERROR' });
        });
    });
});
