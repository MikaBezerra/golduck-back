import type { Category, Person } from '../../../generated/prisma/client.js';
import type { StatementSource } from '../service/summary-statement.builder.js';
import { Injectable } from '@nestjs/common';

import { ExpenseSplit } from '../../../generated/prisma/client.js';

import { addMonths, formatMonth } from '../../common/date/month.js';
import { PrismaService } from '../../common/index.js';
import { AmountGroup, MonthGroups } from '../service/summary.calculator.js';

type GroupRow = {
    month: Date;
    _sum: { amountCents: bigint | null };
    _count: { _all: number };
};

@Injectable()
export class SummaryRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /**
     * Entrada, reserva e despesas agrupadas de cada mês, a partir de start, na ordem dos
     * meses, mais as compras do cartão ainda sem pessoa (PENDING). Despesas do cartão
     * excluídas não entram.
     */
    public async loadMonths(start: Date, count: number): Promise<MonthGroups[]> {
        const range = { gte: start, lt: addMonths(start, count) };
        const manualWhere = { month: range };
        const cardWhere = { month: range, excludedAt: null };
        const aggregates = { _sum: { amountCents: true }, _count: { _all: true } } as const;
        const [incomes, reserves, manualByPerson, cardByCategory, cardByPerson, pendingByMonth] = await Promise.all([
            this.prisma.monthlyIncome.findMany({ where: { month: range }, select: { month: true, amountCents: true } }),
            this.prisma.monthlyReserve.findMany({ where: { month: range }, select: { month: true, amountCents: true } }),
            this.prisma.manualExpense.groupBy({ by: ['month', 'personId'], where: manualWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['month', 'categoryId'], where: cardWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['month', 'personId'], where: cardWhere, ...aggregates }),
            this.prisma.cardExpense.groupBy({ by: ['month'], where: { ...cardWhere, split: ExpenseSplit.PENDING }, ...aggregates })
        ]);
        const months = Array.from({ length: count }, (_, index) => formatMonth(addMonths(start, index)));
        const byMonth = new Map<string, MonthGroups>(months.map(month => [month, {
            incomeCents: null,
            reserveCents: null,
            manualByPerson: [],
            cardByCategory: [],
            cardByPerson: [],
            pending: { amountCents: 0n, count: 0 }
        }]));
        const bucket = (row: { month: Date }): MonthGroups => byMonth.get(formatMonth(row.month)) as MonthGroups;

        for (const income of incomes) {
            bucket(income).incomeCents = income.amountCents;
        }

        for (const reserve of reserves) {
            bucket(reserve).reserveCents = reserve.amountCents;
        }

        manualByPerson.forEach(row => bucket(row).manualByPerson.push(toGroup(row.personId, row)));
        cardByCategory.forEach(row => bucket(row).cardByCategory.push(toGroup(row.categoryId, row)));
        cardByPerson.forEach(row => bucket(row).cardByPerson.push(toGroup(row.personId, row)));
        pendingByMonth.forEach(row => {
            const group = toGroup(null, row);

            bucket(row).pending = { amountCents: group.amountCents, count: group.count };
        });

        return months.map(month => byMonth.get(month) as MonthGroups);
    }

    /**
     * O que a tabela do mês precisa: entrada, reserva do mês e a soma das reservas até ele, todas as
     * pessoas, as despesas do mês (do cartão, sem as excluídas) e os cartões dessas despesas.
     */
    public async loadStatementSource(month: Date): Promise<StatementSource> {
        const range = { gte: month, lt: addMonths(month, 1) };
        const [income, reserve, accumulated, people, manualExpenses, cardExpenses] = await Promise.all([
            this.prisma.monthlyIncome.findUnique({ where: { month }, select: { amountCents: true } }),
            this.prisma.monthlyReserve.findUnique({ where: { month }, select: { amountCents: true } }),
            this.prisma.monthlyReserve.aggregate({ where: { month: { lt: addMonths(month, 1) } }, _sum: { amountCents: true } }),
            this.prisma.person.findMany({ select: { id: true, name: true, active: true } }),
            this.prisma.manualExpense.findMany({
                where: { month: range },
                select: { id: true, title: true, amountCents: true, personId: true }
            }),
            this.prisma.cardExpense.findMany({
                where: { month: range, excludedAt: null },
                select: { id: true, cardId: true, amountCents: true, split: true, personId: true }
            })
        ]);
        const cardIds = [...new Set(cardExpenses.map(expense => expense.cardId))];
        const cards = cardIds.length === 0
            ? []
            : await this.prisma.creditCard.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } });

        return {
            month,
            incomeCents: income?.amountCents ?? null,
            reserveCents: reserve?.amountCents ?? null,
            reserveAccumulatedCents: accumulated._sum.amountCents ?? 0n, // eslint-disable-line no-underscore-dangle
            people,
            manualExpenses,
            cardExpenses,
            cards
        };
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
