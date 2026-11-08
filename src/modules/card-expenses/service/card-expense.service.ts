import type { CardExpense } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { CategoryService } from '../../categories/service/category.service.js';
import { parseMonth } from '../../common/date/month.js';
import { PersonService } from '../../people/service/person.service.js';
import { CardExpenseResponse, CardExpenseScopeDto, ListCardExpensesDto, UpdateCardExpensesDto } from '../dto/card-expense.dto.js';
import { CARD_EXPENSE_ERRORS } from '../errors/card-expense.errors.js';
import { CardExpenseChanges, CardExpenseRepository } from '../repository/card-expense.repository.js';
import { toCardExpenseResponse } from './card-expense.mapper.js';

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
            cardId: query.cardId,
            includeExcluded: query.includeExcluded
        });

        return expenses.map(expense => toCardExpenseResponse(expense));
    }

    public async findById(id: string): Promise<CardExpenseResponse> {
        const expense = await this.cardExpenseRepository.findById(id);

        if (!expense) {
            throw CARD_EXPENSE_ERRORS.notFound('card_expense_id_not_found');
        }

        return toCardExpenseResponse(expense);
    }

    /**
     * Altera apelido, categoria ou pessoa das despesas escolhidas. Em compras
     * parceladas, a alteração vale também para as parcelas seguintes.
     */
    public async updateMany(data: UpdateCardExpensesDto): Promise<CardExpenseResponse[]> {
        const expenses = await this.getByIds(data.ids);

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

        return updated.map(expense => toCardExpenseResponse(expense));
    }

    /** Exclusão suave das despesas escolhidas, no escopo pedido. */
    public async exclude(data: CardExpenseScopeDto): Promise<void> {
        await this.cardExpenseRepository.exclude(await this.getByIds(data.ids), data.scope);
    }

    /** Desfaz a exclusão no escopo pedido; devolve as linhas restauradas. */
    public async restore(data: CardExpenseScopeDto): Promise<CardExpenseResponse[]> {
        const restored = await this.cardExpenseRepository.restore(await this.getByIds(data.ids), data.scope);

        return restored.map(expense => toCardExpenseResponse(expense));
    }

    private async getByIds(ids: string[]): Promise<CardExpense[]> {
        const expenses = await this.cardExpenseRepository.findByIds(ids);

        if (expenses.length !== ids.length) {
            throw CARD_EXPENSE_ERRORS.notFound('card_expense_id_not_found');
        }

        return expenses;
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
}
