import type { MonthlyReserve } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/index.js';

type ReserveEntry = {
    month: Date;
    amountCents: bigint;
};

type Period = {
    start: Date;
    end: Date;
};

@Injectable()
export class ReserveRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async createMany(entries: ReserveEntry[]): Promise<MonthlyReserve[]> {
        return this.prisma.monthlyReserve.createManyAndReturn({
            data: entries
        });
    }

    public async findByMonths(months: Date[]): Promise<MonthlyReserve[]> {
        return this.prisma.monthlyReserve.findMany({
            where: { month: { in: months } },
            orderBy: { month: 'asc' }
        });
    }

    public async findAll(period?: Period): Promise<MonthlyReserve[]> {
        return this.prisma.monthlyReserve.findMany({
            where: period ? { month: { gte: period.start, lt: period.end } } : undefined,
            orderBy: { month: 'asc' }
        });
    }

    /** Todas as reservas (mês e valor), para somar por ano e no total. */
    public async findAllAmounts(): Promise<Pick<MonthlyReserve, 'month' | 'amountCents'>[]> {
        return this.prisma.monthlyReserve.findMany({
            select: { month: true, amountCents: true },
            orderBy: { month: 'asc' }
        });
    }

    public async findByMonth(month: Date): Promise<MonthlyReserve | null> {
        return this.prisma.monthlyReserve.findUnique({
            where: { month }
        });
    }

    public async update(entry: ReserveEntry): Promise<MonthlyReserve> {
        const { month, amountCents } = entry;

        return this.prisma.monthlyReserve.update({
            where: { month },
            data: { amountCents }
        });
    }

    public async delete(month: Date): Promise<MonthlyReserve> {
        return this.prisma.monthlyReserve.delete({
            where: { month }
        });
    }
}
