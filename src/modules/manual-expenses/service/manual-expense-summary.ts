import type { ManualExpense } from '../../../generated/prisma/client.js';

/*
 * Resumo das despesas do mês (aba Despesas): total por categoria, total geral e quanto já foi pago.
 * Função pura, em centavos.
 */

export type SummaryExpense = Pick<ManualExpense, 'categoryId' | 'amountCents' | 'paidAt'>;

export type SummaryCategory = { id: string; name: string };

export type CategoryTotal = {
    categoryId: string;
    name: string;
    totalCents: bigint;
    count: number;
};

export type ManualExpenseTotals = {
    totalCents: bigint;
    paidCents: bigint;
    unpaidCents: bigint;
    count: number;
    /** Do maior total para o menor; no empate, pelo nome. */
    categories: CategoryTotal[];
};

export function summarizeByCategory(expenses: SummaryExpense[], categories: SummaryCategory[]): ManualExpenseTotals {
    const names = new Map(categories.map(category => [category.id, category.name]));
    const byCategory = new Map<string, CategoryTotal>();
    let totalCents = 0n;
    let paidCents = 0n;

    for (const expense of expenses) {
        const current = byCategory.get(expense.categoryId)
            ?? { categoryId: expense.categoryId, name: names.get(expense.categoryId) ?? '', totalCents: 0n, count: 0 };

        current.totalCents += expense.amountCents;
        current.count += 1;
        byCategory.set(expense.categoryId, current);
        totalCents += expense.amountCents;

        if (expense.paidAt) {
            paidCents += expense.amountCents;
        }
    }

    return {
        totalCents,
        paidCents,
        unpaidCents: totalCents - paidCents,
        count: expenses.length,
        categories: [...byCategory.values()].sort(compareTotals)
    };
}

function compareTotals(a: CategoryTotal, b: CategoryTotal): number {
    if (a.totalCents !== b.totalCents) {
        return a.totalCents > b.totalCents ? -1 : 1;
    }

    return a.name.localeCompare(b.name, 'pt-BR');
}
