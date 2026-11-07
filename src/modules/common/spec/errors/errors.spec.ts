import { AppError } from '../../errors/app-error';
import { ERRORS } from '../../errors/error-catalog';

/** Erro de negócio da API: código e status para o cliente, motivo para o log e headers extras. */
describe('AppError', () => {
    it('guarda código, status, mensagem pública e motivo; a mensagem do Error é a pública', () => {
        const error = new AppError('PERSON_NOT_FOUND', 404, 'Pessoa não encontrada', 'person_missing', { 'x-teste': '1' });

        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({
            name: 'AppError',
            code: 'PERSON_NOT_FOUND',
            statusCode: 404,
            publicMessage: 'Pessoa não encontrada',
            message: 'Pessoa não encontrada',
            reason: 'person_missing',
            headers: { 'x-teste': '1' }
        });
        expect(error.stack).toContain('AppError: Pessoa não encontrada');
    });

    it('sem motivo e sem headers: reason undefined e headers vazio', () => {
        const error = new AppError('CONFLICT', 409, 'Conflito');

        expect(error.reason).toBeUndefined();
        expect(error.headers).toEqual({});
    });
});

describe('ERRORS (catálogo de erros genéricos)', () => {
    it.each([
        ['badRequest', ERRORS.badRequest, 'BAD_REQUEST', 400, 'Requisição inválida'],
        ['unauthenticated', ERRORS.unauthenticated, 'UNAUTHENTICATED', 401, 'Autenticação necessária'],
        ['forbidden', ERRORS.forbidden, 'FORBIDDEN', 403, 'Acesso negado'],
        ['notFound', ERRORS.notFound, 'NOT_FOUND', 404, 'Recurso não encontrado'],
        ['conflict', ERRORS.conflict, 'CONFLICT', 409, 'Conflito ao processar a requisição']
    ])('%s: código, status e mensagem, com o motivo recebido', (_, factory, code, statusCode, publicMessage) => {
        const withReason = factory('motivo_do_log');
        const withoutReason = factory();

        expect(withReason).toBeInstanceOf(AppError);
        expect(withReason).toMatchObject({ code, statusCode, publicMessage, reason: 'motivo_do_log', headers: {} });
        expect(withoutReason.reason).toBeUndefined();
    });

    it('tooManyRequests: 429 com Retry-After em segundos inteiros', () => {
        const error = ERRORS.tooManyRequests('login_rate_limited', 30);

        expect(error).toMatchObject({
            code: 'TOO_MANY_REQUESTS',
            statusCode: 429,
            publicMessage: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
            reason: 'login_rate_limited',
            headers: { 'retry-after': '30' }
        });
        expect(ERRORS.tooManyRequests(undefined, 1).reason).toBeUndefined();
    });

    it.each([
        [1, '1'],
        [1.2, '2'],
        [59.01, '60'],
        [0.4, '1'],
        [0, '1'],
        [-5, '1']
    ])('tooManyRequests: %s segundo(s) viram Retry-After "%s" (arredonda para cima, mínimo 1)', (seconds, header) => {
        expect(ERRORS.tooManyRequests('teste', seconds).headers).toEqual({ 'retry-after': header });
    });
});
