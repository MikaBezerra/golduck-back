import type { Category, Person } from '../../../generated/prisma/client.js';
import type { StatementSource } from '../service/summary-statement.builder.js';
import type { AmountGroup, MonthGroups } from '../service/summary.calculator.js';
import { randomUUID } from 'node:crypto';

import { addMonths, formatMonth } from '../../common/date/month.js';

/** Uma despesa já lançada, só com o que o resumo usa. */
export type SummaryExpense = {
    /** "AAAA-MM" (no cartão, o mês da fatura). */
    month: string;
    /** Só no cartão: as despesas fora do cartão não têm categoria. */
    categoryId?: string;
    /** null = compartilhada. */
    personId: string | null;
    amountCents: bigint;
    /** Só no cartão: despesa excluída da fatura (não entra no resumo). */
    excluded?: boolean;
    /** Só no cartão: compra ainda sem pessoa (PENDING; personId precisa ser null). */
    pending?: boolean;
    /** Só na tabela do mês (statement); sem id, vira a posição na lista. */
    id?: string;
    /** Só fora do cartão, na tabela do mês. */
    title?: string;
    /** Só no cartão, na tabela do mês. */
    cardId?: string;
};

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do SummaryRepository */
/**
 * SummaryRepository em memória: guarda entradas, reservas e despesas soltas e agrupa como o
 * groupBy do banco (por mês + pessoa e, no cartão, por mês + categoria), sem as despesas do cartão excluídas.
 */
export class InMemorySummaryRepository {
    /** "AAAA-MM" → centavos. */
    public readonly incomes = new Map<string, bigint>();
    public readonly reserves = new Map<string, bigint>();
    public readonly manualExpenses: SummaryExpense[] = [];
    public readonly cardExpenses: SummaryExpense[] = [];
    public readonly categories = new Map<string, Category>();
    public readonly people = new Map<string, Person>();
    /** Cartões (id → nome), para a tabela do mês. */
    public readonly cards = new Map<string, string>();

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
                manualByPerson: groupBy(manual, expense => expense.personId),
                cardByCategory: groupBy(card, expense => expense.categoryId ?? null),
                cardByPerson: groupBy(card, expense => expense.personId),
                pending: card
                    .filter(expense => expense.pending)
                    .reduce((total, expense) => ({ amountCents: total.amountCents + expense.amountCents, count: total.count + 1 }), { amountCents: 0n, count: 0 })
            };
        });
    }

    public async loadStatementSource(month: Date): Promise<StatementSource> {
        const key = formatMonth(month);

        return {
            month,
            incomeCents: this.incomes.get(key) ?? null,
            reserveCents: this.reserves.get(key) ?? null,
            reserveAccumulatedCents: [...this.reserves.entries()]
                .filter(([reserveMonth]) => reserveMonth <= key)
                .reduce((total, [, cents]) => total + cents, 0n),
            people: [...this.people.values()].map(person => ({ id: person.id, name: person.name, active: person.active })),
            manualExpenses: this.manualExpenses
                .filter(expense => expense.month === key)
                .map((expense, index) => ({
                    id: expense.id ?? `manual-${index}`,
                    title: expense.title ?? 'Despesa',
                    amountCents: expense.amountCents,
                    personId: expense.personId
                })),
            cardExpenses: this.cardExpenses
                .filter(expense => expense.month === key && !expense.excluded)
                .map((expense, index) => ({
                    id: expense.id ?? `card-${index}`,
                    cardId: expense.cardId ?? 'cartao',
                    amountCents: expense.amountCents,
                    split: expense.pending ? 'PENDING' as const : expense.personId === null ? 'SHARED' as const : 'PERSONAL' as const,
                    personId: expense.personId
                })),
            cards: [...this.cards.entries()].map(([id, name]) => ({ id, name }))
        };
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
