import type { Category, Person } from '../../../generated/prisma/client';
import type { AmountGroup, MonthGroups } from '../service/summary.calculator';
import { randomUUID } from 'node:crypto';

import { addMonths, formatMonth } from '../../common/date/month';

/** Uma despesa já lançada, só com o que o resumo usa. */
export type SummaryExpense = {
    /** "AAAA-MM" (no cartão, o mês da fatura). */
    month: string;
    categoryId: string;
    /** null = compartilhada. */
    personId: string | null;
    amountCents: bigint;
    /** Só no cartão: despesa excluída da fatura (não entra no resumo). */
    excluded?: boolean;
};

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do SummaryRepository */
/**
 * SummaryRepository em memória: guarda entradas, reservas e despesas soltas e agrupa como o
 * groupBy do banco (por mês + categoria e por mês + pessoa), sem as despesas do cartão excluídas.
 */
export class InMemorySummaryRepository {
    /** "AAAA-MM" → centavos. */
    public readonly incomes = new Map<string, bigint>();
    public readonly reserves = new Map<string, bigint>();
    public readonly manualExpenses: SummaryExpense[] = [];
    public readonly cardExpenses: SummaryExpense[] = [];
    public readonly categories = new Map<string, Category>();
    public readonly people = new Map<string, Person>();

    public seedCategory(data: Partial<Category> & Pick<Category, 'name'>): Category {
        const now = new Date('2026-01-01T00:00:00.000Z');
        const category: Category = {
            id: randomUUID(),
            nameKey: data.name.toLocaleLowerCase('pt-BR'),
            active: true,
            isDefault: false,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.categories.set(category.id, category);
        return category;
    }

    public seedPerson(data: Partial<Person> & Pick<Person, 'name'>): Person {
        const now = new Date('2026-01-01T00:00:00.000Z');
        const person: Person = {
            id: randomUUID(),
            email: null,
            phone: null,
            active: true,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.people.set(person.id, person);
        return person;
    }

    public async loadMonths(start: Date, count: number): Promise<MonthGroups[]> {
        return Array.from({ length: count }, (_, index) => {
            const month = formatMonth(addMonths(start, index));
            const manual = this.manualExpenses.filter(expense => expense.month === month);
            const card = this.cardExpenses.filter(expense => expense.month === month && !expense.excluded);

            return {
                incomeCents: this.incomes.get(month) ?? null,
                reserveCents: this.reserves.get(month) ?? null,
                manualByCategory: groupBy(manual, expense => expense.categoryId),
                manualByPerson: groupBy(manual, expense => expense.personId),
                cardByCategory: groupBy(card, expense => expense.categoryId),
                cardByPerson: groupBy(card, expense => expense.personId)
            };
        });
    }

    public async findCategories(ids: string[]): Promise<Category[]> {
        return [...this.categories.values()].filter(category => ids.includes(category.id));
    }

    /** Como o banco: as pessoas pedidas e todas as ativas. */
    public async findPeople(ids: string[]): Promise<Person[]> {
        return [...this.people.values()].filter(person => ids.includes(person.id) || person.active);
    }
}
/* eslint-enable @typescript-eslint/require-await */

function groupBy(expenses: SummaryExpense[], keyOf: (expense: SummaryExpense) => string | null): AmountGroup[] {
    const groups = new Map<string | null, AmountGroup>();

    for (const expense of expenses) {
        const key = keyOf(expense);
        const current = groups.get(key) ?? { key, amountCents: 0n, count: 0 };

        groups.set(key, { key, amountCents: current.amountCents + expense.amountCents, count: current.count + 1 });
    }

    return [...groups.values()];
}
