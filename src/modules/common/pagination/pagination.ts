import * as Joi from 'joi';

import { JoiValidationPipePtbr } from '../validation/joi-validation-ptbr.pipe';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Página pedida pelo cliente: ?page=1&pageSize=20. */
export interface PageQuery {
    readonly page: number;
    readonly pageSize: number;
}

/** Resposta paginada: os itens da página e os totais para montar a navegação. */
export interface Page<T> {
    readonly items: T[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
}

/**
 * Campos de paginação para compor o schema da query de uma rota com outros filtros:
 *
 * ```ts
 * Joi.object({ ...pageQueryKeys, search: Joi.string().optional() }).unknown(false)
 * ```
 */
export const pageQueryKeys = {
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
};

/** Valida a query de uma rota que só recebe page e pageSize. */
export class PageQueryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<PageQuery>(pageQueryKeys).unknown(false);
    }
}

/** skip/take do Prisma para a página pedida. */
export function toSkipTake(query: PageQuery): { skip: number; take: number } {
    return {
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
    };
}

export function buildPage<T>(items: T[], total: number, query: PageQuery): Page<T> {
    return {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize)
    };
}

/**
 * Busca os itens da página e o total em paralelo.
 *
 * ```ts
 * const where = { active: true };
 * return paginate(query, {
 *     findMany: ({ skip, take }) => this.prisma.person.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
 *     count: () => this.prisma.person.count({ where })
 * });
 * ```
 *
 * Use sempre um orderBy estável (com desempate por id, se preciso) para as páginas não repetirem itens.
 */
export async function paginate<T>(
    query: PageQuery,
    source: {
        findMany: (args: { skip: number; take: number }) => Promise<T[]>;
        count: () => Promise<number>;
    }
): Promise<Page<T>> {
    const [items, total] = await Promise.all([
        source.findMany(toSkipTake(query)),
        source.count()
    ]);

    return buildPage(items, total, query);
}

/** Converte os itens de uma página (ex.: registro do banco → DTO de resposta). */
export function mapPage<T, R>(page: Page<T>, mapper: (item: T) => R): Page<R> {
    return { ...page, items: page.items.map(mapper) };
}
