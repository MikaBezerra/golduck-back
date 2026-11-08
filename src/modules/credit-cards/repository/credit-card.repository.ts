import type { CardBank, CardBill, CreditCard } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';

/** Campos de configuração do cartão (cadastro e alteração). */
export type CreditCardSettings = {
    dueDay?: number;
    bestPurchaseDay?: number;
    pluggyItemId?: string | null;
    /** Muda junto com pluggyItemId: a conta de cartão é descoberta de novo na próxima sincronização. */
    pluggyAccountId?: string | null;
    syncFromMonth?: Date | null;
};

export type CreditCardChanges = CreditCardSettings & {
    name?: string;
    active?: boolean;
};

/** Situação da sincronização, gravada a cada tentativa. */
export type CreditCardSyncState = {
    pluggyAccountId?: string;
    syncedAt?: Date;
    syncDataUpdatedAt?: Date | null;
    syncStatus?: string | null;
    syncError?: string | null;
    syncConsentExpiresAt?: Date | null;
};

@Injectable()
export class CreditCardRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async create(data: CreditCardSettings & { name: string; bank: CardBank }): Promise<CreditCard> {
        return this.prisma.creditCard.create({ data });
    }

    public async findAll(): Promise<CreditCard[]> {
        return this.prisma.creditCard.findMany({
            where: { active: true },
            orderBy: [
                { name: 'asc' },
                { id: 'asc' }
            ]
        });
    }

    public async findById(id: string): Promise<CreditCard | null> {
        return this.prisma.creditCard.findUnique({ where: { id } });
    }

    public async update(id: string, data: CreditCardChanges): Promise<CreditCard> {
        return this.prisma.creditCard.update({ where: { id }, data });
    }

    public async updateSyncState(id: string, data: CreditCardSyncState): Promise<CreditCard> {
        return this.prisma.creditCard.update({ where: { id }, data });
    }

    /** Faturas gravadas do cartão (ajustes do usuário e datas do banco). */
    public async findBills(cardId: string): Promise<CardBill[]> {
        return this.prisma.cardBill.findMany({ where: { cardId }, orderBy: { month: 'asc' } });
    }

    /** Ajuste do usuário no melhor dia de uma fatura (null volta ao padrão). */
    public async saveBestPurchaseDate(cardId: string, month: Date, bestPurchaseDate: Date | null): Promise<CardBill> {
        return this.prisma.cardBill.upsert({
            where: { cardId_month: { cardId, month } },
            create: { cardId, month, bestPurchaseDate },
            update: { bestPurchaseDate }
        });
    }

    /** Fechamento e vencimento informados pelo banco (faturas já fechadas). */
    public async saveBankDates(cardId: string, bills: { month: Date; closingDate: Date; dueDate: Date }[]): Promise<void> {
        await this.prisma.$transaction(async tx => {
            for (const bill of bills) {
                await tx.cardBill.upsert({
                    where: { cardId_month: { cardId, month: bill.month } },
                    create: { cardId, month: bill.month, bankClosingDate: bill.closingDate, bankDueDate: bill.dueDate },
                    update: { bankClosingDate: bill.closingDate, bankDueDate: bill.dueDate }
                });
            }
        });
    }
}
