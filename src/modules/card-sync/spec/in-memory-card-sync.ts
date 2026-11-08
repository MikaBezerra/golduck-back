import type { CardExpense, CardPurchaseCorrection } from '../../../generated/prisma/client.js';
import type { InMemoryCardExpenseRepository } from '../../card-expenses/spec/in-memory-card-expense.repository.js';
import type { CardSyncContext } from '../repository/card-sync.repository.js';
import type { CardSyncPlan } from '../service/card-sync.planner.js';
import { randomUUID } from 'node:crypto';

import { PluggyAccount, PluggyBill, PluggyClient, PluggyItem, PluggyTransaction } from '../pluggy/pluggy-client.js';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona das classes reais */

/**
 * CardSyncRepository em memória, sobre as despesas e correções do InMemoryCardExpenseRepository
 * (o mesmo "banco" das despesas do cartão).
 */
export class InMemoryCardSyncRepository {
    public constructor(private readonly expenses: InMemoryCardExpenseRepository) { }

    public async apply(
        input: { cardId: string; syncFromMonth: Date; purchaseKeys: string[] },
        plan: (context: CardSyncContext) => CardSyncPlan
    ): Promise<CardSyncPlan> {
        const keys = new Set(input.purchaseKeys);
        const existing = [...this.expenses.expenses.values()].filter(row =>
            row.cardId === input.cardId && (row.month.getTime() >= input.syncFromMonth.getTime() || keys.has(row.purchaseKey)));
        const corrections = [...this.expenses.corrections.entries()]
            .filter(([key]) => key.startsWith(`${input.cardId}|`))
            .map(([key, correction]): CardPurchaseCorrection => ({
                id: randomUUID(),
                cardId: input.cardId,
                purchaseKey: key.slice(input.cardId.length + 1),
                ...correction,
                createdAt: new Date(),
                updatedAt: new Date()
            }));
        const result = plan({ existing, corrections });
        const now = new Date();

        for (const id of result.deleteIds) {
            this.expenses.expenses.delete(id);
        }

        for (const update of result.updates) {
            this.expenses.expenses.set(update.id, { ...this.expenses.get(update.id), ...update.data, updatedAt: now });
        }

        for (const row of result.creates) {
            const created: CardExpense = { ...row, id: randomUUID(), createdAt: now, updatedAt: now };

            this.expenses.expenses.set(created.id, created);
        }

        return result;
    }
}

/** Pluggy falsa: devolve o que o teste preparou e registra as chamadas. */
export class FakePluggyClient extends PluggyClient {
    public readonly enabled = true;
    public item: PluggyItem = {
        id: 'item-1',
        status: 'UPDATED',
        lastUpdatedAt: '2026-11-08T14:44:12.000Z',
        consentExpiresAt: '2027-11-08T14:00:00.000Z'
    };
    public accounts: PluggyAccount[] = [
        { id: 'conta-corrente', type: 'BANK', subtype: 'CHECKING_ACCOUNT' },
        { id: 'conta-cartao', type: 'CREDIT', subtype: 'CREDIT_CARD' }
    ];
    public transactions: PluggyTransaction[] = [];
    public bills: PluggyBill[] = [];
    /** Falha em toda chamada a getItem. */
    public failure: Error | null = null;
    /** Resultado de cada chamada a getItem, na ordem (null = dá certo); depois vale failure. */
    public failures: Array<Error | null> = [];
    public readonly calls: string[] = [];

    public async getItem(itemId: string): Promise<PluggyItem> {
        this.calls.push(`item:${itemId}`);

        const failure = this.failures.length > 0 ? this.failures.shift() : this.failure;

        if (failure) {
            throw failure;
        }

        return this.item;
    }

    public async listAccounts(itemId: string): Promise<PluggyAccount[]> {
        this.calls.push(`accounts:${itemId}`);
        return this.accounts;
    }

    public async listTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
        this.calls.push(`transactions:${accountId}:${dateFrom}`);
        return this.transactions;
    }

    public async listBills(accountId: string): Promise<PluggyBill[]> {
        this.calls.push(`bills:${accountId}`);
        return this.bills;
    }
}
/* eslint-enable @typescript-eslint/require-await */
