import { AppError } from '../../common/errors/app-error';
import { AUTH_ERRORS } from '../errors/auth.errors';

describe('AUTH_ERRORS', () => {
    it('cada erro tem código, status e mensagem pública fixos, e o motivo vai só para o log', () => {
        const cases = [
            { error: AUTH_ERRORS.invalidCredentials('motivo-1'), code: 'AUTH_INVALID_CREDENTIALS', statusCode: 401, message: 'Credenciais inválidas', reason: 'motivo-1' },
            { error: AUTH_ERRORS.invalidSession('motivo-2'), code: 'AUTH_INVALID_SESSION', statusCode: 401, message: 'Sessão inválida', reason: 'motivo-2' },
            { error: AUTH_ERRORS.unauthenticated('motivo-3'), code: 'AUTH_UNAUTHENTICATED', statusCode: 401, message: 'Autenticação necessária', reason: 'motivo-3' },
            { error: AUTH_ERRORS.forbidden('motivo-4'), code: 'AUTH_FORBIDDEN', statusCode: 403, message: 'Acesso negado', reason: 'motivo-4' }
        ];

        for (const { error, code, statusCode, message, reason } of cases) {
            expect(error).toBeInstanceOf(AppError);
            expect(error).toMatchObject({ code, statusCode, publicMessage: message, message, reason, headers: {} });
        }
    });

    it('o motivo é opcional', () => {
        expect(AUTH_ERRORS.forbidden().reason).toBeUndefined();
        expect(AUTH_ERRORS.invalidSession().code).toBe('AUTH_INVALID_SESSION');
    });
});
