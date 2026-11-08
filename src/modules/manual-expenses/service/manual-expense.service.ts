import type { ManualExpense } from '../../../generated/prisma/client.js';
import type { ChosenSplit, SplitAssignment } from '../../common/expense-split/expense-split.js';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { formatAmountCents, parsePositiveAmountCents } from '../../common/money/money.js';
import { PersonService } from '../../people/service/person.service.js';
import {
    CreateManualExpenseDto,
    ListManualExpensesDto,
    ManualExpenseResponse,
    ManualExpensesSummaryResponse,
    UpdateManualExpensesDto
} from '../dto/manual-expense.dto.js';
import { MANUAL_EXPENSE_ERRORS } from '../errors/manual-expense.errors.js';
import { ManualExpenseRepository } from '../repository/manual-expense.repository.js';
import { summarizeExpenses } from './manual-expense-summary.js';

@Injectable()
export class ManualExpenseService {
    public constructor(
        private readonly manualExpenseRepository: ManualExpenseRepository,
        private readonly personService: PersonService
    ) { }

    public async create(data: CreateManualExpenseDto): Promise<ManualExpenseResponse[]> {
        const amountCents = this.parseAmount(data.amount);
        const assignment = await this.resolveSplit(data.split, data.personId);

        const [year, firstMonth] = data.month.split('-').map(Number);
        const lastMonth = data.replicateUntilYearEnd ? 12 : firstMonth;
        const entries = [];

        for (let month = firstMonth; month <= lastMonth; month++) {
            entries.push({
                month: new Date(Date.UTC(year, month - 1, 1)),
                title: data.title,
                amountCents,
                ...assignment
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

    /** Total geral do mês e quanto já foi pago. */
    public async summarize(query: ListManualExpensesDto): Promise<ManualExpensesSummaryResponse> {
        const expenses = await this.manualExpenseRepository.findAllByMonth(this.toMonthDate(query.month));
        const totals = summarizeExpenses(expenses);

        return {
            month: query.month,
            total: formatAmountCents(totals.totalCents),
            paid: formatAmountCents(totals.paidCents),
            unpaid: formatAmountCents(totals.unpaidCents),
            count: totals.count
        };
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
            ...(data.changes.split === undefined
                ? {}
                : await this.resolveSplit(data.changes.split, data.changes.personId)),
            paidAt: data.changes.paid === undefined
                ? undefined
                : data.changes.paid ? new Date() : null
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

    /** O pipe já garante personId só (e sempre) no PERSONAL; aqui, que a pessoa existe e está ativa. */
    private async resolveSplit(split: ChosenSplit, personId?: string | null): Promise<SplitAssignment> {
        if (split !== 'PERSONAL' || !personId) {
            return { split: 'SHARED', personId: null };
        }

        const person = await this.personService.findById(personId);

        if (!person.active) {
            throw MANUAL_EXPENSE_ERRORS.inactivePerson('person_inactive');
        }

        return { split, personId: person.id };
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
            split: expense.split,
            personId: expense.personId,
            paidAt: expense.paidAt,
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
