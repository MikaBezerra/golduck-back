import type { CardExpense } from '../../../generated/prisma/client';
import type { CardExpenseResponse } from '../dto/card-expense.dto';
import { formatDate, formatMonth } from '../../common/date/month';
import { formatAmountCents } from '../../common/money/money';

/** Converte a despesa do banco no formato da API (usado também pela pré-visualização de faturas). */
export function toCardExpenseResponse(expense: CardExpense): CardExpenseResponse {
    return {
        id: expense.id,
        cardId: expense.cardId,
        importId: expense.importId,
        month: formatMonth(expense.month),
        transactionDate: formatDate(expense.transactionDate),
        description: expense.nickname ?? expense.originalDescription,
        originalDescription: expense.originalDescription,
        nickname: expense.nickname,
        holderName: expense.holderName,
        cardLastDigits: expense.cardLastDigits,
        amount: formatAmountCents(expense.amountCents),
        installment: expense.installmentNumber !== null && expense.installmentTotal !== null
            ? { number: expense.installmentNumber, total: expense.installmentTotal }
            : null,
        categoryId: expense.categoryId,
        personId: expense.personId,
        excluded: expense.excludedAt !== null,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt
    };
}
