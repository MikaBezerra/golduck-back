import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';

export const AuthErrors = {
    invalidCredentials: (reason?: string): AppError =>
        new AppError('AUTH_INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED, 'Credenciais inválidas', reason),
    invalidSession: (reason?: string): AppError =>
        new AppError('AUTH_INVALID_SESSION', HttpStatus.UNAUTHORIZED, 'Sessão inválida', reason),
    unauthenticated: (reason?: string): AppError =>
        new AppError('AUTH_UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Autenticação necessária', reason),
    forbidden: (reason?: string): AppError =>
        new AppError('AUTH_FORBIDDEN', HttpStatus.FORBIDDEN, 'Acesso negado', reason)
};
