import type { ManualExpense } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { CategoryService } from '../../categories/service/category.service.js';
import { formatAmountCents, parsePositiveAmountCents } from '../../common/money/money.js';
import { PersonService } from '../../people/service/person.service.js';
import {
    CreateManualExpenseDto,
    ListManualExpensesDto,
    ManualExpenseResponse,
    UpdateManualExpensesDto
} from '../dto/manual-expense.dto.js';
import { MANUAL_EXPENSE_ERRORS } from '../errors/manual-expense.errors.js';
import { ManualExpenseRepository } from '../repository/manual-expense.repository.js';

@Injectable()
export class ManualExpenseService {
    public constructor(
        private readonly manualExpenseRepository: ManualExpenseRepository,
        private readonly categoryService: CategoryService,
        private readonly personService: PersonService
    ) { }

    public async create(data: CreateManualExpenseDto): Promise<ManualExpenseResponse[]> {
        const amountCents = this.parseAmount(data.amount);
        const categoryId = await this.resolveCategoryId(data.categoryId);
        const personId = await this.resolvePersonId(data.personId);

        const [year, firstMonth] = data.month.split('-').map(Number);
        const lastMonth = data.replicateUntilYearEnd ? 12 : firstMonth;
        const entries = [];

        for (let month = firstMonth; month <= lastMonth; month++) {
            entries.push({
                month: new Date(Date.UTC(year, month - 1, 1)),
                title: data.title,
                amountCents,
                categoryId,
                personId
            });
        }

        const created = await this.manualExpenseRepository.createMany(entries);

        return created
            .sort((first, second) => first.month.getTime() - second.month.getTime())
            .map(expense => this.toResponse(expense));
    }

    public async findAll(query: ListManualExpensesDto): Promise<ManualExpenseResponse[]> {
        const expenses = await this.manualExpenseRepository.findAllByMonth(
            this.toMonthDate(query.month)
        );

        return expenses.map(expense => this.toResponse(expense));
    }

    public async findById(id: string): Promise<ManualExpenseResponse> {
        const expense = await this.manualExpenseRepository.findById(id);

        if (!expense) {
            throw MANUAL_EXPENSE_ERRORS.notFound('manual_expense_id_not_found');
        }

        return this.toResponse(expense);
    }

    public async updateMany(
        data: UpdateManualExpensesDto
    ): Promise<ManualExpenseResponse[]> {
        const changes = {
            title: data.changes.title,
            amountCents: data.changes.amount === undefined
                ? undefined
                : this.parseAmount(data.changes.amount),
            categoryId: data.changes.categoryId === undefined
                ? undefined
                : await this.resolveCategoryId(data.changes.categoryId),
            personId: data.changes.personId === undefined
                ? undefined
                : await this.resolvePersonId(data.changes.personId)
        };

        try {
            const updated = await this.manualExpenseRepository.updateManyByIds(
                data.ids,
                changes
            );

            return updated.map(expense => this.toResponse(expense));
        } catch (error: unknown) {
            this.rethrowNotFound(error);
        }
    }

    public async deleteMany(ids: string[]): Promise<void> {
        try {
            await this.manualExpenseRepository.deleteManyByIds(ids);
        } catch (error: unknown) {
            this.rethrowNotFound(error);
        }
    }

    private async resolveCategoryId(categoryId?: string): Promise<string> {
        if (categoryId === undefined) {
            const defaultCategory = await this.categoryService.findDefault();
            return defaultCategory.id;
        }

        const category = await this.categoryService.findById(categoryId);

        if (!category.active) {
            throw MANUAL_EXPENSE_ERRORS.inactiveCategory('category_inactive');
        }

        return category.id;
    }

    private async resolvePersonId(personId?: string | null): Promise<string | null> {
        if (personId === undefined || personId === null) {
            return null;
        }

        const person = await this.personService.findById(personId);

        if (!person.active) {
            throw MANUAL_EXPENSE_ERRORS.inactivePerson('person_inactive');
        }

        return person.id;
    }

    private parseAmount(amount: string): bigint {
        const cents = parsePositiveAmountCents(amount);

        if (cents === null) {
            throw MANUAL_EXPENSE_ERRORS.invalidAmount('manual_expense_amount_invalid');
        }

        return cents;
    }

    private toMonthDate(month: string): Date {
        const [year, monthNumber] = month.split('-').map(Number);
        return new Date(Date.UTC(year, monthNumber - 1, 1));
    }

    private toResponse(expense: ManualExpense): ManualExpenseResponse {
        return {
            id: expense.id,
            month: expense.month.toISOString().slice(0, 7),
            title: expense.title,
            amount: formatAmountCents(expense.amountCents),
            categoryId: expense.categoryId,
            personId: expense.personId,
            createdAt: expense.createdAt,
            updatedAt: expense.updatedAt
        };
    }

    private rethrowNotFound(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2025'
        ) {
            throw MANUAL_EXPENSE_ERRORS.notFound('manual_expense_id_not_found');
        }

        throw error;
    }
}
