import type { ManualExpense } from '../../../generated/prisma/client.js';

/*
 * Resumo das despesas do mês (aba Despesas): total geral e quanto já foi pago.
 * Função pura, em centavos.
 */

export type SummaryExpense = Pick<ManualExpense, 'amountCents' | 'paidAt'>;

export type ManualExpenseTotals = {
    totalCents: bigint;
    paidCents: bigint;
    unpaidCents: bigint;
    count: number;
};

export function summarizeExpenses(expenses: SummaryExpense[]): ManualExpenseTotals {
    let totalCents = 0n;
    let paidCents = 0n;

    for (const expense of expenses) {
        totalCents += expense.amountCents;

        if (expense.paidAt) {
            paidCents += expense.amountCents;
        }
    }

    return {
        totalCents,
        paidCents,
        unpaidCents: totalCents - paidCents,
        count: expenses.length
    };
}
