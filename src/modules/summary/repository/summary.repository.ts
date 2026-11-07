import type { Category, Person } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';
import { AmountGroup } from '../service/summary.calculator';

export type MonthTotals = {
    incomeCents: bigint | null;
    manualByCategory: AmountGroup[];
    manualByPerson: AmountGroup[];
    cardByCategory: AmountGroup[];
    cardByPerson: AmountGroup[];
};

type GroupRow = {
    _sum: { amountCents: bigint | null };
    _count: { _all: number };
};

@Injectable()
export class SummaryRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /** Entrada e despesas do mês agrupadas; despesas do cartão excluídas não entram. */
    public async loadMonth(month: Date): Promise<MonthTotals> {
        const manualWhere = { month };
        const cardWhere = { month, excludedAt: null };
        const aggregates = { _sum: { amountCents: true }, _count: { _all: true } } as const;
        const [income, manualByCategory, manualByPerson, cardByCategory, cardByPerson] = await Promise.all([
            this.prisma.monthlyIncome.findUnique({ where: { month }, select: { amountCents: true } }),
            this.prisma.manualExpense.groupBy({ by: ['categoryId'], where: manualWhere, ...aggregates }),
            this.prisma.manualExpense.groupBy({ by: ['personId'], where: manualWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['categoryId'], where: cardWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['personId'], where: cardWhere, ...aggregates })
        ]);

        return {
            incomeCents: income?.amountCents ?? null,
            manualByCategory: manualByCategory.map(row => toGroup(row.categoryId, row)),
            manualByPerson: manualByPerson.map(row => toGroup(row.personId, row)),
            cardByCategory: cardByCategory.map(row => toGroup(row.categoryId, row)),
            cardByPerson: cardByPerson.map(row => toGroup(row.personId, row))
        };
    }

    public async findCategories(ids: string[]): Promise<Category[]> {
        return ids.length === 0 ? [] : this.prisma.category.findMany({ where: { id: { in: ids } } });
    }

    /** Pessoas com despesas no mês (ids) e todas as ativas (participam da divisão). */
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
