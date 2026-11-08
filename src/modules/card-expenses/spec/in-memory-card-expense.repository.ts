import type { CardExpense, ExpenseSplit } from '../../../generated/prisma/client.js';
import type { CardExpenseChanges, NewCardExpenseRow, PurchaseCorrectionData } from '../repository/card-expense.repository.js';
import type { CardExpenseScope } from '../service/card-expense-scope.js';
import { randomUUID } from 'node:crypto';

import { assertSplitCheck, splitFor } from '../../../testing/expense-split-check.js';
import { addMonths } from '../../common/date/month.js';

export const CARD_ID = '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
export const IMPORT_ID = '8e9f0a1b-2c3d-4e5f-9a6b-7c8d9e0f1a2b';

/** Ordem do banco: mês, data da compra, descrição original e id. */
const compareRows = (a: CardExpense, b: CardExpense): number =>
    a.month.getTime() - b.month.getTime()
    || a.transactionDate.getTime() - b.transactionDate.getTime()
    || a.originalDescription.localeCompare(b.originalDescription)
    || a.id.localeCompare(b.id);

/** O mês da linha está no escopo, a partir do mês da linha escolhida? */
const monthInScope = (rowMonth: Date, month: Date, scope: CardExpenseScope): boolean => {
    const row = rowMonth.getTime();
    const chosen = month.getTime();

    switch (scope) {
        case 'month': return row === chosen;
        case 'forward': return row >= chosen;
        case 'backward': return row <= chosen;
        case 'all': return true;
    }
};

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do CardExpenseRepository */
/**
 * CardExpenseRepository em memória. Compra à vista (installmentTotal null) afeta só a própria linha;
 * parcelada, as linhas do mesmo cartão e purchaseKey no escopo, como as consultas do repositório real.
 */
export class InMemoryCardExpenseRepository {
    public readonly expenses = new Map<string, CardExpense>();
    /** Correções de mês/parcela gravadas, por "cardId|purchaseKey". */
    public readonly corrections = new Map<string, PurchaseCorrectionData>();

    /** Cadastra direto (como um upload de fatura faria), para montar o cenário do teste. */
    public seed(data: Partial<CardExpense> & Pick<CardExpense, 'month' | 'categoryId'>): CardExpense {
        const now = new Date();
        const id = randomUUID();
        const expense: CardExpense = {
            id,
            cardId: CARD_ID,
            importId: IMPORT_ID,
            origin: 'UPLOAD',
            externalId: null,
            sourceMonth: data.month,
            purchaseKey: `S|${id}`,
            transactionDate: new Date('2026-09-15T00:00:00.000Z'),
            originalDescription: 'COMPRA',
            holderName: null,
            cardLastDigits: null,
            amountCents: 1000n,
            installmentNumber: null,
            installmentTotal: null,
            nickname: null,
            personId: null,
            split: splitFor(data.personId),
            excludedAt: null,
            exclusionRemembered: false,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        assertSplitCheck(expense);
        this.expenses.set(expense.id, expense);
        return expense;
    }

    /** Uma compra parcelada: uma linha por parcela, em faturas seguidas a partir de firstMonth. */
    public seedInstallments(
        firstMonth: Date,
        total: number,
        data: Partial<CardExpense> & Pick<CardExpense, 'categoryId' | 'purchaseKey'>
    ): CardExpense[] {
        return Array.from({ length: total }, (_, index) => this.seed({
            ...data,
            month: addMonths(firstMonth, index),
            installmentNumber: index + 1,
            installmentTotal: total
        }));
    }

    /** A linha gravada (falha o teste se não existir). */
    public get(id: string): CardExpense {
        const expense = this.expenses.get(id);

        if (!expense) {
            throw new Error(`despesa do cartão ${id} não existe`);
        }

        return expense;
    }

    public async findAll(filter: { month: Date; cardId?: string; includeExcluded: boolean; split?: ExpenseSplit }): Promise<CardExpense[]> {
        return [...this.expenses.values()]
            .filter(expense => expense.month.getTime() === filter.month.getTime())
            .filter(expense => filter.cardId === undefined || expense.cardId === filter.cardId)
            .filter(expense => filter.split === undefined || expense.split === filter.split)
            .filter(expense => filter.includeExcluded || expense.excludedAt === null)
            .sort(compareRows);
    }

    public async findById(id: string): Promise<CardExpense | null> {
        return this.expenses.get(id) ?? null;
    }

    public async findByIds(ids: string[]): Promise<CardExpense[]> {
        return [...this.expenses.values()].filter(expense => ids.includes(expense.id));
    }

    public async findPurchase(cardId: string, purchaseKey: string): Promise<CardExpense[]> {
        return [...this.expenses.values()]
            .filter(expense => expense.cardId === cardId && expense.purchaseKey === purchaseKey)
            .sort(compareRows);
    }

    public async createPurchase(rows: NewCardExpenseRow[]): Promise<CardExpense[]> {
        for (const row of rows) {
            this.insert(row);
        }

        return this.findPurchase(rows[0].cardId, rows[0].purchaseKey);
    }

    public async replacePurchase(
        purchase: { cardId: string; purchaseKey: string },
        rows: NewCardExpenseRow[],
        correction: PurchaseCorrectionData | null
    ): Promise<CardExpense[]> {
        for (const row of await this.findPurchase(purchase.cardId, purchase.purchaseKey)) {
            this.expenses.delete(row.id);
        }

        for (const row of rows) {
            this.insert(row);
        }

        if (correction) {
            this.corrections.set(`${purchase.cardId}|${purchase.purchaseKey}`, correction);
        }

        return this.findPurchase(purchase.cardId, purchase.purchaseKey);
    }

    public async updateWithFollowingInstallments(expenses: CardExpense[], changes: CardExpenseChanges): Promise<CardExpense[]> {
        const defined = Object.fromEntries(
            Object.entries(changes).filter(([, value]) => value !== undefined)
        ) as CardExpenseChanges;
        const targets = this.rowsInScope(expenses, 'forward');

        for (const row of targets) {
            const updated = { ...row, ...defined, updatedAt: new Date() };

            assertSplitCheck(updated);
            this.expenses.set(row.id, updated);
        }

        return targets.map(row => this.get(row.id)).sort(compareRows);
    }

    public async exclude(expenses: CardExpense[], scope: CardExpenseScope): Promise<void> {
        const now = new Date();

        for (const row of this.rowsInScope(expenses, scope)) {
            // A data da primeira exclusão é mantida; "não perguntar de novo" volta a valer.
            this.expenses.set(row.id, { ...row, excludedAt: row.excludedAt ?? now, exclusionRemembered: false, updatedAt: now });
        }
    }

    public async restore(expenses: CardExpense[], scope: CardExpenseScope): Promise<CardExpense[]> {
        const restored = this.rowsInScope(expenses, scope).filter(row => row.excludedAt !== null);

        for (const row of restored) {
            this.expenses.set(row.id, { ...row, excludedAt: null, exclusionRemembered: false, updatedAt: new Date() });
        }

        return restored.map(row => this.get(row.id)).sort(compareRows);
    }

    private insert(row: NewCardExpenseRow): CardExpense {
        const now = new Date();
        const expense: CardExpense = { ...row, id: randomUUID(), createdAt: now, updatedAt: now };

        assertSplitCheck(expense);
        this.expenses.set(expense.id, expense);
        return expense;
    }

    private rowsInScope(expenses: CardExpense[], scope: CardExpenseScope): CardExpense[] {
        return [...this.expenses.values()].filter(row => expenses.some(expense => expense.installmentTotal === null
            ? row.id === expense.id
            : row.cardId === expense.cardId
                && row.purchaseKey === expense.purchaseKey
                && monthInScope(row.month, expense.month, scope)));
    }
}
/* eslint-enable @typescript-eslint/require-await */
