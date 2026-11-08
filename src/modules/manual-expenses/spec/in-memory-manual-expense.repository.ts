import type { ManualExpense } from '../../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client.js';
import { assertSplitCheck, splitFor } from '../../../testing/expense-split-check.js';

type NewManualExpense = Pick<ManualExpense, 'month' | 'title' | 'amountCents' | 'categoryId' | 'split' | 'personId'>;
type ManualExpenseChanges = Partial<Pick<ManualExpense, 'title' | 'amountCents' | 'categoryId' | 'split' | 'personId'>>;

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do ManualExpenseRepository */
/**
 * ManualExpenseRepository em memória, com a mesma ordenação do banco e as alterações/exclusões
 * em lote "tudo ou nada", como o $transaction do Prisma: se um id não existe, lança P2025 e nada muda.
 */
export class InMemoryManualExpenseRepository {
    public readonly expenses = new Map<string, ManualExpense>();

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). */
    public seed(data: Partial<ManualExpense> & Pick<ManualExpense, 'month' | 'title' | 'categoryId'>): ManualExpense {
        const now = new Date();
        const expense: ManualExpense = {
            id: randomUUID(),
            amountCents: 1000n,
            personId: null,
            split: splitFor(data.personId),
            createdAt: now,
            updatedAt: now,
            ...data
        };
        assertSplitCheck(expense);
        this.expenses.set(expense.id, expense);
        return expense;
    }

    /** A linha gravada (falha o teste se não existir). */
    public get(id: string): ManualExpense {
        const expense = this.expenses.get(id);

        if (!expense) {
            throw new Error(`despesa ${id} não existe`);
        }

        return expense;
    }

    public async createMany(entries: NewManualExpense[]): Promise<ManualExpense[]> {
        return entries.map(entry => this.seed(entry));
    }

    public async findAllByMonth(month: Date): Promise<ManualExpense[]> {
        return [...this.expenses.values()]
            .filter(expense => expense.month.getTime() === month.getTime())
            .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR') || a.id.localeCompare(b.id));
    }

    public async findById(id: string): Promise<ManualExpense | null> {
        return this.expenses.get(id) ?? null;
    }

    public async updateManyByIds(ids: string[], changes: ManualExpenseChanges): Promise<ManualExpense[]> {
        this.assertAllExist(ids);

        // Como o Prisma: campo undefined fica como está.
        const defined = Object.fromEntries(
            Object.entries(changes).filter(([, value]) => value !== undefined)
        ) as ManualExpenseChanges;

        return ids.map(id => {
            const updated: ManualExpense = { ...this.get(id), ...defined, updatedAt: new Date() };
            assertSplitCheck(updated);
            this.expenses.set(id, updated);
            return updated;
        });
    }

    public async deleteManyByIds(ids: string[]): Promise<ManualExpense[]> {
        this.assertAllExist(ids);

        return ids.map(id => {
            const deleted = this.get(id);
            this.expenses.delete(id);
            return deleted;
        });
    }

    /** Como o update/delete do Prisma num id que não existe: P2025 (e a transação desfaz tudo). */
    private assertAllExist(ids: string[]): void {
        if (ids.some(id => !this.expenses.has(id))) {
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: 'teste' });
        }
    }
}
/* eslint-enable @typescript-eslint/require-await */
