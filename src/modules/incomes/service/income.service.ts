import { Injectable } from '@nestjs/common';
import { MonthlyIncome, Prisma } from '../../../generated/prisma/client';

import {
    CreateIncomeDto,
    IncomeResponse,
    ListIncomeDto,
    UpdateIncomeDto
} from '../dto/income.dto';
import { INCOME_ERRORS } from '../errors/income.errors';
import { IncomeRepository } from '../repository/income.repository';

const MAX_AMOUNT_CENTS = 9223372036854775807n;

@Injectable()
export class IncomeService {
    public constructor(private readonly incomeRepository: IncomeRepository) { }

    public async create(data: CreateIncomeDto): Promise<IncomeResponse[]> {
        const amountCents = this.parseAmount(data.amount);
        const months = data.months.map(month =>
            new Date(Date.UTC(data.year, month - 1, 1))
        );

        const existing = await this.incomeRepository.findByMonths(months);

        if (existing.length > 0) {
            throw INCOME_ERRORS.monthConflict('income_month_already_exists');
        }

        try {
            const created = await this.incomeRepository.createMany(
                months.map(month => ({ month, amountCents }))
            );

            return created
                .sort((first, second) => first.month.getTime() - second.month.getTime())
                .map(income => this.toResponse(income));
        } catch (error: unknown) {
            this.rethrowMonthConflict(error);
        }
    }

    public async findAll(query: ListIncomeDto): Promise<IncomeResponse[]> {
        const period = query.year === undefined
            ? undefined
            : {
                start: new Date(Date.UTC(query.year, 0, 1)),
                end: new Date(Date.UTC(query.year + 1, 0, 1))
            };

        const incomes = await this.incomeRepository.findAll(period);

        return incomes.map(income => this.toResponse(income));
    }

    public async findByMonth(month: string): Promise<IncomeResponse> {
        const income = await this.incomeRepository.findByMonth(
            this.toMonthDate(month)
        );

        if (!income) {
            throw INCOME_ERRORS.notFound('income_month_not_found');
        }

        return this.toResponse(income);
    }

    public async update(
        month: string,
        data: UpdateIncomeDto
    ): Promise<IncomeResponse> {
        const amountCents = this.parseAmount(data.amount);

        try {
            const updated = await this.incomeRepository.update({
                month: this.toMonthDate(month),
                amountCents
            });

            return this.toResponse(updated);
        } catch (error: unknown) {
            this.rethrowNotFound(error);
        }
    }

    public async delete(month: string): Promise<void> {
        try {
            await this.incomeRepository.delete(this.toMonthDate(month));
        } catch (error: unknown) {
            this.rethrowNotFound(error);
        }
    }

    private toMonthDate(month: string): Date {
        const [year, monthNumber] = month.split('-').map(Number);

        return new Date(Date.UTC(year, monthNumber - 1, 1));
    }

    private parseAmount(amount: string): bigint {
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) {
            throw INCOME_ERRORS.invalidAmount('income_amount_format');
        }

        const [whole, fraction = ''] = amount.split('.');
        const cents = BigInt(whole) * 100n
            + BigInt(fraction.padEnd(2, '0'));

        if (cents <= 0n || cents > MAX_AMOUNT_CENTS) {
            throw INCOME_ERRORS.invalidAmount('income_amount_out_of_range');
        }

        return cents;
    }

    private toResponse(income: MonthlyIncome): IncomeResponse {
        const reais = income.amountCents / 100n;
        const centavos = (income.amountCents % 100n)
            .toString()
            .padStart(2, '0');

        return {
            id: income.id,
            month: income.month.toISOString().slice(0, 7),
            amount: `${reais}.${centavos}`,
            createdAt: income.createdAt,
            updatedAt: income.updatedAt
        };
    }

    private rethrowMonthConflict(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2002'
        ) {
            throw INCOME_ERRORS.monthConflict('income_month_already_exists');
        }

        throw error;
    }

    private rethrowNotFound(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2025'
        ) {
            throw INCOME_ERRORS.notFound('income_month_not_found');
        }

        throw error;
    }
}
