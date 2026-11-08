import type { Prisma } from '../../../generated/prisma/client.js';

/** Parcelas de uma compra afetadas por excluir ou restaurar, a partir de um mês. */
export const CARD_EXPENSE_SCOPES = ['month', 'forward', 'backward', 'all'] as const;

export type CardExpenseScope = typeof CARD_EXPENSE_SCOPES[number];

/**
 * Filtro das linhas de uma compra (mesmo cartão e purchaseKey) dentro do escopo:
 * month = só o mês; forward = o mês e os seguintes; backward = o mês e os
 * anteriores; all = todas as parcelas.
 */
export function purchaseScopeWhere(
    purchase: { cardId: string; purchaseKey: string },
    month: Date,
    scope: CardExpenseScope
): Prisma.CardExpenseWhereInput {
    const monthFilter: Record<CardExpenseScope, Prisma.DateTimeFilter | undefined> = {
        month: { equals: month },
        forward: { gte: month },
        backward: { lte: month },
        all: undefined
    };

    return {
        cardId: purchase.cardId,
        purchaseKey: purchase.purchaseKey,
        month: monthFilter[scope]
    };
}
