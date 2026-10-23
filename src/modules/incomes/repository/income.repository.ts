import type { MonthlyIncome } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common';

type IncomeEntry = {
    month: Date;
    amountCents: bigint;
};

type Period = {
    start: Date;
    end: Date;
};

@Injectable()
export class IncomeRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async createMany(entries: IncomeEntry[]): Promise<MonthlyIncome[]> {
        return this.prisma.monthlyIncome.createManyAndReturn({
            data: entries
        });
    }

    public async findByMonths(months: Date[]): Promise<MonthlyIncome[]> {
        return this.prisma.monthlyIncome.findMany({
            where: { month: { in: months } },
            orderBy: { month: 'asc' }
        });
    }

    public async findAll(period?: Period): Promise<MonthlyIncome[]> {
        return this.prisma.monthlyIncome.findMany({
            where: period ? { month: { gte: period.start, lt: period.end } } : undefined,
            orderBy: { month: 'asc' }
        });
    }

    public async findByMonth(month: Date): Promise<MonthlyIncome | null> {
        return this.prisma.monthlyIncome.findUnique({
            where: { month }
        });
    }

    public async update(entry: IncomeEntry): Promise<MonthlyIncome> {
        const { month, amountCents } = entry;

        return this.prisma.monthlyIncome.update({
            where: { month },
            data: { amountCents }
        });
    }

    public async delete(month: Date): Promise<MonthlyIncome> {
        return this.prisma.monthlyIncome.delete({
            where: { month }
        });
    }
}
