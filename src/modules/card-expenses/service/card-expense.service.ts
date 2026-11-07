import type { CardExpense } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { CategoryService } from '../../categories/service/category.service';
import { formatDate, formatMonth, parseMonth } from '../../common/date/month';
import { formatAmountCents } from '../../common/money/money';
import { PersonService } from '../../people/service/person.service';
import { CardExpenseResponse, ListCardExpensesDto, UpdateCardExpensesDto } from '../dto/card-expense.dto';
import { CARD_EXPENSE_ERRORS } from '../errors/card-expense.errors';
import { CardExpenseChanges, CardExpenseRepository } from '../repository/card-expense.repository';

@Injectable()
export class CardExpenseService {
    public constructor(
        private readonly cardExpenseRepository: CardExpenseRepository,
        private readonly categoryService: CategoryService,
        private readonly personService: PersonService
    ) { }

    public async findAll(query: ListCardExpensesDto): Promise<CardExpenseResponse[]> {
        const expenses = await this.cardExpenseRepository.findAll({
            month: parseMonth(query.month),
            cardId: query.cardId
        });

        return expenses.map(expense => this.toResponse(expense));
    }

    public async findById(id: string): Promise<CardExpenseResponse> {
        const expense = await this.cardExpenseRepository.findById(id);

        if (!expense) {
            throw CARD_EXPENSE_ERRORS.notFound('card_expense_id_not_found');
        }

        return this.toResponse(expense);
    }

    /**
     * Altera apelido, categoria ou pessoa das despesas escolhidas. Em compras
     * parceladas, a alteração vale também para as parcelas seguintes.
     */
    public async updateMany(data: UpdateCardExpensesDto): Promise<CardExpenseResponse[]> {
        const expenses = await this.cardExpenseRepository.findByIds(data.ids);

        if (expenses.length !== data.ids.length) {
            throw CARD_EXPENSE_ERRORS.notFound('card_expense_id_not_found');
        }

        const changes: CardExpenseChanges = {
            nickname: data.changes.nickname,
            categoryId: data.changes.categoryId === undefined
                ? undefined
                : await this.resolveCategoryId(data.changes.categoryId),
            personId: data.changes.personId === undefined
                ? undefined
                : await this.resolvePersonId(data.changes.personId)
        };
        const updated = await this.cardExpenseRepository.updateWithFollowingInstallments(expenses, changes);

        return updated.map(expense => this.toResponse(expense));
    }

    private async resolveCategoryId(categoryId: string): Promise<string> {
        const category = await this.categoryService.findById(categoryId);

        if (!category.active) {
            throw CARD_EXPENSE_ERRORS.inactiveCategory('category_inactive');
        }

        return category.id;
    }

    private async resolvePersonId(personId: string | null): Promise<string | null> {
        if (personId === null) {
            return null;
        }

        const person = await this.personService.findById(personId);

        if (!person.active) {
            throw CARD_EXPENSE_ERRORS.inactivePerson('person_inactive');
        }

        return person.id;
    }

    private toResponse(expense: CardExpense): CardExpenseResponse {
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
            createdAt: expense.createdAt,
            updatedAt: expense.updatedAt
        };
    }
}
