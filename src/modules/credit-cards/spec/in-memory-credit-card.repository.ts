import type { CardBank, CardBill, CreditCard } from '../../../generated/prisma/client.js';
import type {
    CardBillPayment,
    CardBillTotal,
    CreditCardChanges,
    CreditCardSettings,
    CreditCardSyncState
} from '../repository/credit-card.repository.js';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client.js';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do CreditCardRepository */
/**
 * CreditCardRepository em memória, com a mesma ordenação do banco (nome e, no empate, id). Como no
 * Prisma, um campo `undefined` no update não muda nada.
 */
export class InMemoryCreditCardRepository {
    public readonly cards = new Map<string, CreditCard>();
    /** Faturas gravadas, por "cardId|mês". */
    public readonly bills = new Map<string, CardBill>();
    /** Compras não excluídas de cada fatura (o que o banco somaria em CardExpense). */
    public readonly billTotals: CardBillTotal[] = [];

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). */
    public seed(data: Partial<CreditCard> & Pick<CreditCard, 'name'>): CreditCard {
        const now = new Date();
        const card: CreditCard = {
            id: randomUUID(),
            bank: 'NUBANK',
            active: true,
            dueDay: null,
            bestPurchaseDay: null,
            pluggyItemId: null,
            pluggyAccountId: null,
            syncFromMonth: null,
            syncedAt: null,
            syncDataUpdatedAt: null,
            syncStatus: null,
            syncError: null,
            syncConsentExpiresAt: null,
            creditLimitCents: null,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.cards.set(card.id, card);
        return card;
    }

    /** O cartão gravado (falha o teste se não existir). */
    public get(id: string): CreditCard {
        const card = this.cards.get(id);

        if (!card) {
            throw new Error(`cartão ${id} não existe`);
        }

        return card;
    }

    public async create(data: CreditCardSettings & { name: string; bank: CardBank }): Promise<CreditCard> {
        return this.seed(definedOnly(data) as Partial<CreditCard> & Pick<CreditCard, 'name'>);
    }

    public async findAll(): Promise<CreditCard[]> {
        return [...this.cards.values()]
            .filter(card => card.active)
            .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
    }

    public async findActiveOrIn(ids: string[]): Promise<CreditCard[]> {
        return [...this.cards.values()]
            .filter(card => card.active || ids.includes(card.id))
            .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
    }

    public async findById(id: string): Promise<CreditCard | null> {
        return this.cards.get(id) ?? null;
    }

    public async update(id: string, data: CreditCardChanges): Promise<CreditCard> {
        const card = this.cards.get(id);

        if (!card) {
            // Como o Prisma no update de um id que não existe.
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025', clientVersion: 'teste' });
        }

        const updated: CreditCard = { ...card, ...definedOnly(data), updatedAt: new Date() };
        this.cards.set(id, updated);
        return updated;
    }

    public async updateSyncState(id: string, data: CreditCardSyncState): Promise<CreditCard> {
        return this.update(id, data);
    }

    public async findBills(cardId: string): Promise<CardBill[]> {
        return [...this.bills.values()]
            .filter(bill => bill.cardId === cardId)
            .sort((a, b) => a.month.getTime() - b.month.getTime());
    }

    public async findBillsOfCards(cardIds: string[]): Promise<CardBill[]> {
        return [...this.bills.values()]
            .filter(bill => cardIds.includes(bill.cardId))
            .sort((a, b) => a.month.getTime() - b.month.getTime());
    }

    public async saveBestPurchaseDate(cardId: string, month: Date, bestPurchaseDate: Date | null): Promise<CardBill> {
        return this.upsertBill(cardId, month, { bestPurchaseDate });
    }

    public async saveBankDates(cardId: string, bills: { month: Date; closingDate: Date; dueDate: Date }[]): Promise<void> {
        for (const bill of bills) {
            this.upsertBill(cardId, bill.month, { bankClosingDate: bill.closingDate, bankDueDate: bill.dueDate });
        }
    }

    public async savePayment(cardId: string, month: Date, payment: CardBillPayment): Promise<CardBill> {
        return this.upsertBill(cardId, month, payment);
    }

    public async sumBillTotals(filter: { cardId?: string; month?: Date; fromMonth?: Date }): Promise<CardBillTotal[]> {
        return this.billTotals.filter(total =>
            (filter.cardId === undefined || total.cardId === filter.cardId)
            && (filter.month === undefined || total.month.getTime() === filter.month.getTime())
            && (filter.fromMonth === undefined || total.month.getTime() >= filter.fromMonth.getTime()));
    }

    /** O CardBill gravado (ou undefined). */
    public bill(cardId: string, month: Date): CardBill | undefined {
        return this.bills.get(`${cardId}|${month.toISOString()}`);
    }

    private upsertBill(cardId: string, month: Date, data: Partial<CardBill>): CardBill {
        const key = `${cardId}|${month.toISOString()}`;
        const now = new Date();
        const bill: CardBill = {
            id: randomUUID(),
            cardId,
            month,
            bestPurchaseDate: null,
            bankClosingDate: null,
            bankDueDate: null,
            paidAt: null,
            paidAmountCents: null,
            createdAt: now,
            ...this.bills.get(key),
            ...data,
            updatedAt: now
        };

        this.bills.set(key, bill);
        return bill;
    }
}
/* eslint-enable @typescript-eslint/require-await */

/** Como no Prisma: campo undefined não muda nada. */
function definedOnly<T extends object>(data: T): Partial<T> {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Ordem de texto simples, como o ORDER BY por código do banco. */
function compareText(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
}
