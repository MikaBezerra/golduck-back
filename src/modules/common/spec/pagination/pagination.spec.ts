import { jest } from '@jest/globals';
import * as Joi from 'joi';

import {
    buildPage,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    mapPage,
    paginate,
    PageQuery,
    PageQueryPipe,
    pageQueryKeys,
    toSkipTake
} from '../../pagination/pagination';
import { ValidationError } from '../../validation/validation-error';

/** Os detalhes do erro de validação lançado pelo pipe (falha o teste se não lançar). */
function validationDetails(run: () => unknown): ValidationError['details'] {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        return (error as ValidationError).details;
    }

    throw new Error('o pipe deveria ter recusado o valor');
}

describe('PageQueryPipe', () => {
    const pipe = new PageQueryPipe();

    it('sem page/pageSize usa a página 1 com 20 itens', () => {
        expect(DEFAULT_PAGE_SIZE).toBe(20);
        expect(pipe.transform({})).toEqual({ page: 1, pageSize: 20 });
    });

    it('converte os textos da query em número e aceita pageSize de 1 a 100', () => {
        expect(MAX_PAGE_SIZE).toBe(100);
        expect(pipe.transform({ page: '3', pageSize: '1' })).toEqual({ page: 3, pageSize: 1 });
        expect(pipe.transform({ page: '1', pageSize: '100' })).toEqual({ page: 1, pageSize: 100 });
    });

    it.each([
        [{ page: '0' }, 'page', 'number.min', 'page deve ser maior ou igual a 1'],
        [{ page: '-1' }, 'page', 'number.min', 'page deve ser maior ou igual a 1'],
        [{ page: '1.5' }, 'page', 'number.integer', 'page deve ser um número inteiro'],
        [{ page: 'primeira' }, 'page', 'number.base', 'page deve ser um número'],
        [{ pageSize: '0' }, 'pageSize', 'number.min', 'pageSize deve ser maior ou igual a 1'],
        [{ pageSize: '101' }, 'pageSize', 'number.max', 'pageSize deve ser menor ou igual a 100'],
        [{ pageSize: '2.5' }, 'pageSize', 'number.integer', 'pageSize deve ser um número inteiro'],
        [{ search: 'x' }, 'search', 'object.unknown', 'search não é permitido']
    ])('recusa %o', (query, field, code, message) => {
        expect(validationDetails(() => pipe.transform(query))).toEqual([{ field, code, message }]);
    });

    it('pageQueryKeys compõe o schema de outras rotas com filtros próprios', () => {
        const schema = Joi.object({ ...pageQueryKeys, search: Joi.string().optional() }).unknown(false);

        expect(schema.validate({ search: 'mer' }).value).toEqual({ search: 'mer', page: 1, pageSize: 20 });
        expect(schema.validate({ pageSize: 101 }).error?.details[0].type).toBe('number.max');
    });
});

describe('toSkipTake', () => {
    it.each([
        [{ page: 1, pageSize: 20 }, { skip: 0, take: 20 }],
        [{ page: 2, pageSize: 20 }, { skip: 20, take: 20 }],
        [{ page: 3, pageSize: 7 }, { skip: 14, take: 7 }]
    ])('%o → %o', (query, expected) => {
        expect(toSkipTake(query)).toEqual(expected);
    });
});

describe('buildPage', () => {
    it.each([
        [0, 0],
        [1, 1],
        [20, 1],
        [21, 2],
        [40, 2],
        [41, 3]
    ])('com %s itens no total e 20 por página, são %s páginas', (total, totalPages) => {
        expect(buildPage(['a'], total, { page: 2, pageSize: 20 })).toEqual({
            items: ['a'],
            page: 2,
            pageSize: 20,
            total,
            totalPages
        });
    });
});

describe('paginate', () => {
    it('busca a página (skip/take) e o total ao mesmo tempo e monta a resposta', async () => {
        let releaseItems: (items: string[]) => void = () => undefined;
        const findMany = jest.fn(async (): Promise<string[]> => new Promise<string[]>(resolve => {
            releaseItems = resolve;
        }));
        const count = jest.fn(async (): Promise<number> => Promise.resolve(45));
        const query: PageQuery = { page: 3, pageSize: 20 };

        const pending = paginate(query, { findMany, count });

        // O total já foi pedido antes de a busca dos itens terminar.
        expect(findMany).toHaveBeenCalledWith({ skip: 40, take: 20 });
        expect(count).toHaveBeenCalledTimes(1);

        releaseItems(['x', 'y']);

        await expect(pending).resolves.toEqual({ items: ['x', 'y'], page: 3, pageSize: 20, total: 45, totalPages: 3 });
    });

    it('erro em uma das buscas rejeita a página', async () => {
        const failure = new Error('banco fora do ar');

        await expect(paginate({ page: 1, pageSize: 20 }, {
            findMany: async () => Promise.resolve([]),
            count: async () => Promise.reject(failure)
        })).rejects.toBe(failure);
    });
});

describe('mapPage', () => {
    it('converte os itens e mantém os totais, sem alterar a página original', () => {
        const page = buildPage([1, 2, 3], 23, { page: 1, pageSize: 3 });

        const mapped = mapPage(page, value => `item ${value}`);

        expect(mapped).toEqual({ items: ['item 1', 'item 2', 'item 3'], page: 1, pageSize: 3, total: 23, totalPages: 8 });
        expect(page.items).toEqual([1, 2, 3]);
    });
});
