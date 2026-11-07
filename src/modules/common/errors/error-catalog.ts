import { HttpStatus } from '@nestjs/common';

import { AppError } from './app-error';

export const ERRORS = {
    badRequest: (reason?: string): AppError => new AppError('BAD_REQUEST', HttpStatus.BAD_REQUEST, 'Requisição inválida', reason),
    unauthenticated: (reason?: string): AppError => new AppError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Autenticação necessária', reason),
    forbidden: (reason?: string): AppError => new AppError('FORBIDDEN', HttpStatus.FORBIDDEN, 'Acesso negado', reason),
    notFound: (reason?: string): AppError => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND, 'Recurso não encontrado', reason),
    conflict: (reason?: string): AppError => new AppError('CONFLICT', HttpStatus.CONFLICT, 'Conflito ao processar a requisição', reason),
    tooManyRequests: (reason?: string): AppError =>
        new AppError('TOO_MANY_REQUESTS', HttpStatus.TOO_MANY_REQUESTS, 'Muitas tentativas. Aguarde um pouco e tente novamente.', reason)
};
