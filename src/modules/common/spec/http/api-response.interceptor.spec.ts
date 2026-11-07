import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

import { ApiResponseInterceptor } from '../../http/api-response.interceptor';

/** Envelope { data } das respostas de sucesso, direto no interceptor (sem HTTP). */
describe('ApiResponseInterceptor', () => {
    const interceptor = new ApiResponseInterceptor();

    /** O que o interceptor devolve para o valor do controller, com o status já definido na resposta. */
    const intercept = async (value: unknown, statusCode = 200): Promise<unknown> => {
        const context = { switchToHttp: () => ({ getResponse: () => ({ statusCode }) }) } as unknown as ExecutionContext;
        const next: CallHandler = { handle: () => of(value) };

        return lastValueFrom(interceptor.intercept(context, next));
    };

    it.each([
        [{ id: '1' }],
        [[1, 2]],
        ['texto'],
        [''],
        [0],
        [false],
        [null]
    ])('embrulha %p em { data }', async value => {
        await expect(intercept(value)).resolves.toEqual({ data: value });
    });

    it('201 também vem embrulhado', async () => {
        await expect(intercept({ id: '1' }, 201)).resolves.toEqual({ data: { id: '1' } });
    });

    it('controller sem retorno (undefined): sem corpo', async () => {
        await expect(intercept(undefined)).resolves.toBeUndefined();
    });

    it('204: sem corpo, mesmo que o controller devolva algo', async () => {
        await expect(intercept({ id: '1' }, 204)).resolves.toBeUndefined();
    });
});
