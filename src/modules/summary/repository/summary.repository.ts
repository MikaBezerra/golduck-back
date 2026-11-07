import type { Category, Person } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';
import { addMonths, formatMonth } from '../../common/date/month';
import { AmountGroup, MonthGroups } from '../service/summary.calculator';

type GroupRow = {
    month: Date;
    _sum: { amountCents: bigint | null };
    _count: { _all: number };
};

@Injectable()
export class SummaryRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /**
     * Entrada e despesas agrupadas de cada mês, a partir de start, na ordem dos meses.
     * Despesas do cartão excluídas não entram.
     */
    public async loadMonths(start: Date, count: number): Promise<MonthGroups[]> {
        const range = { gte: start, lt: addMonths(start, count) };
        const manualWhere = { month: range };
        const cardWhere = { month: range, excludedAt: null };
        const aggregates = { _sum: { amountCents: true }, _count: { _all: true } } as const;
        const [incomes, manualByCategory, manualByPerson, cardByCategory, cardByPerson] = await Promise.all([
            this.prisma.monthlyIncome.findMany({ where: { month: range }, select: { month: true, amountCents: true } }),
            this.prisma.manualExpense.groupBy({ by: ['month', 'categoryId'], where: manualWhere, ...aggregates }),
            this.prisma.manualExpense.groupBy({ by: ['month', 'personId'], where: manualWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['month', 'categoryId'], where: cardWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['month', 'personId'], where: cardWhere, ...aggregates })
        ]);
        const months = Array.from({ length: count }, (_, index) => formatMonth(addMonths(start, index)));
        const byMonth = new Map<string, MonthGroups>(months.map(month => [month, {
            incomeCents: null,
            manualByCategory: [],
            manualByPerson: [],
            cardByCategory: [],
            cardByPerson: []
        }]));
        const bucket = (row: { month: Date }): MonthGroups => byMonth.get(formatMonth(row.month)) as MonthGroups;

        for (const income of incomes) {
            bucket(income).incomeCents = income.amountCents;
        }

        manualByCategory.forEach(row => bucket(row).manualByCategory.push(toGroup(row.categoryId, row)));
        manualByPerson.forEach(row => bucket(row).manualByPerson.push(toGroup(row.personId, row)));
        cardByCategory.forEach(row => bucket(row).cardByCategory.push(toGroup(row.categoryId, row)));
        cardByPerson.forEach(row => bucket(row).cardByPerson.push(toGroup(row.personId, row)));

        return months.map(month => byMonth.get(month) as MonthGroups);
    }

    public async findCategories(ids: string[]): Promise<Category[]> {
        return ids.length === 0 ? [] : this.prisma.category.findMany({ where: { id: { in: ids } } });
    }

    /** Pessoas com despesas no período (ids) e todas as ativas (participam da divisão). */
    public async findPeople(ids: string[]): Promise<Person[]> {
        return this.prisma.person.findMany({
            where: { OR: [{ id: { in: ids } }, { active: true }] }
        });
    }
}

function toGroup(key: string | null, row: GroupRow): AmountGroup {
    return {
        key,
        amountCents: row._sum.amountCents ?? 0n, // eslint-disable-line no-underscore-dangle
        count: row._count._all // eslint-disable-line no-underscore-dangle
    };
}
