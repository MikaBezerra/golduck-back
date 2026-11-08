import { jest } from '@jest/globals';
import type { FastifyRequest } from 'fastify';

import { RequestLogContext } from '../../logging/request-log.context.js';

const fakeRequest = (): FastifyRequest => ({}) as FastifyRequest;

/** Guarda, por requisição, o início (para a duração) e a falha registrada pelo filtro de erros. */
describe('RequestLogContext', () => {
    let context: RequestLogContext;

    beforeEach(() => {
        context = new RequestLogContext();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('mede a duração em milissegundos inteiros, do start ao finish', () => {
        jest.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(1334.6);
        const request = fakeRequest();

        context.start(request);
        const result = context.finish(request);

        expect(result).toStrictEqual({ durationMs: 1235 });
    });

    it('sem start a duração é 0', () => {
        jest.spyOn(performance, 'now').mockReturnValue(5000);

        expect(context.finish(fakeRequest())).toStrictEqual({ durationMs: 0 });
    });

    it('devolve a falha registrada para a requisição', () => {
        jest.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(12);
        const request = fakeRequest();
        const failure = { code: 'CATEGORY_NOT_FOUND', reason: 'category_id_not_found' };

        context.start(request);
        context.recordFailure(request, failure);

        expect(context.finish(request)).toStrictEqual({ durationMs: 2, failure });
    });

    it('cada requisição tem os próprios dados, que são apagados no finish', () => {
        jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(50).mockReturnValueOnce(80).mockReturnValue(1000);
        const first = fakeRequest();
        const second = fakeRequest();

        context.start(first);
        context.start(second);
        context.recordFailure(second, { code: 'X' });

        expect(context.finish(first)).toStrictEqual({ durationMs: 80 });
        expect(context.finish(second)).toStrictEqual({ durationMs: 950, failure: { code: 'X' } });
        expect(context.finish(second)).toStrictEqual({ durationMs: 0 });
    });
});
