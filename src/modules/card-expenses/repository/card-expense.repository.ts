import type { CardExpense, Prisma } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';
import { CardExpenseScope, purchaseScopeWhere } from '../service/card-expense-scope.js';

export type CardExpenseChanges = {
    nickname?: string | null;
    categoryId?: string;
    personId?: string | null;
};

/** Uma linha nova de despesa do cartão, com todos os campos que o banco não preenche sozinho. */
export type NewCardExpenseRow = Omit<CardExpense, 'id' | 'createdAt' | 'updatedAt'>;

/** A parcela installmentNumber fica em month (as outras seguem a partir dela). */
export type PurchaseCorrectionData = {
    installmentNumber: number;
    installmentTotal: number | null;
    month: Date;
};

const ORDER_BY = [
    { month: 'asc' },
    { transactionDate: 'asc' },
    { originalDescription: 'asc' },
    { id: 'asc' }
] satisfies Prisma.CardExpenseOrderByWithRelationInput[];

@Injectable()
export class CardExpenseRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /** Sem includeExcluded, esconde as despesas excluídas. */
    public async findAll(filter: { month: Date; cardId?: string; includeExcluded: boolean }): Promise<CardExpense[]> {
        return this.prisma.cardExpense.findMany({
            where: {
                month: filter.month,
                cardId: filter.cardId,
                ...(filter.includeExcluded ? {} : { excludedAt: null })
            },
            orderBy: ORDER_BY
        });
    }

    public async findById(id: string): Promise<CardExpense | null> {
        return this.prisma.cardExpense.findUnique({ where: { id } });
    }

    public async findByIds(ids: string[]): Promise<CardExpense[]> {
        return this.prisma.cardExpense.findMany({ where: { id: { in: ids } } });
    }

    /** Todas as linhas de uma compra (as parcelas, em qualquer mês). */
    public async findPurchase(cardId: string, purchaseKey: string): Promise<CardExpense[]> {
        return this.prisma.cardExpense.findMany({ where: { cardId, purchaseKey }, orderBy: ORDER_BY });
    }

    /** Grava as linhas de uma compra nova ("Adicionar compra") e as devolve. */
    public async createPurchase(rows: NewCardExpenseRow[]): Promise<CardExpense[]> {
        return this.prisma.$transaction(async tx => {
            await tx.cardExpense.createMany({ data: rows });

            return tx.cardExpense.findMany({
                where: { cardId: rows[0].cardId, purchaseKey: rows[0].purchaseKey },
                orderBy: ORDER_BY
            });
        });
    }

    /**
     * Troca todas as linhas da compra pelas novas (correção de mês ou parcela). Com correction, ela
     * é gravada para a sincronização respeitar a escolha do usuário daqui em diante.
     */
    public async replacePurchase(
        purchase: { cardId: string; purchaseKey: string },
        rows: NewCardExpenseRow[],
        correction: PurchaseCorrectionData | null
    ): Promise<CardExpense[]> {
        const where = { cardId: purchase.cardId, purchaseKey: purchase.purchaseKey };

        return this.prisma.$transaction(async tx => {
            await tx.cardExpense.deleteMany({ where });

            if (rows.length > 0) {
                await tx.cardExpense.createMany({ data: rows });
            }

            if (correction) {
                await tx.cardPurchaseCorrection.upsert({
                    where: { cardId_purchaseKey: where },
                    create: { ...where, ...correction },
                    update: correction
                });
            }

            return tx.cardExpense.findMany({ where, orderBy: ORDER_BY });
        });
    }

    /**
     * Aplica as alterações nas despesas escolhidas e nas parcelas seguintes
     * da mesma compra, no mesmo cartão. Devolve todas as linhas alteradas.
     */
    public async updateWithFollowingInstallments(
        expenses: CardExpense[],
        changes: CardExpenseChanges
    ): Promise<CardExpense[]> {
        const where: Prisma.CardExpenseWhereInput = {
            OR: expenses.map(expense => expense.installmentTotal === null
                ? { id: expense.id }
                : {
                    cardId: expense.cardId,
                    purchaseKey: expense.purchaseKey,
                    month: { gte: expense.month }
                })
        };

        return this.prisma.$transaction(async tx => {
            await tx.cardExpense.updateMany({ where, data: changes });

            return tx.cardExpense.findMany({ where, orderBy: ORDER_BY });
        });
    }

    /**
     * Exclui (exclusão suave) as despesas escolhidas e, em compras parceladas, as
     * parcelas dentro do escopo. A pergunta "manter excluída?" volta a valer.
     */
    public async exclude(expenses: CardExpense[], scope: CardExpenseScope): Promise<void> {
        const where = this.scopeWhere(expenses, scope);

        await this.prisma.$transaction([
            this.prisma.cardExpense.updateMany({ where: { ...where, excludedAt: null }, data: { excludedAt: new Date() } }),
            this.prisma.cardExpense.updateMany({ where, data: { exclusionRemembered: false } })
        ]);
    }

    /** Desfaz a exclusão no escopo. Devolve as linhas restauradas. */
    public async restore(expenses: CardExpense[], scope: CardExpenseScope): Promise<CardExpense[]> {
        const where = this.scopeWhere(expenses, scope);

        return this.prisma.$transaction(async tx => {
            const restored = await tx.cardExpense.findMany({ where: { ...where, excludedAt: { not: null } }, select: { id: true } });
            const ids = restored.map(row => row.id);

            await tx.cardExpense.updateMany({
                where: { id: { in: ids } },
                data: { excludedAt: null, exclusionRemembered: false }
            });

            return tx.cardExpense.findMany({ where: { id: { in: ids } }, orderBy: ORDER_BY });
        });
    }

    /** Compra à vista afeta só a própria linha; parcelada, as parcelas no escopo. */
    private scopeWhere(expenses: CardExpense[], scope: CardExpenseScope): Prisma.CardExpenseWhereInput {
        return {
            OR: expenses.map(expense => expense.installmentTotal === null
                ? { id: expense.id }
                : purchaseScopeWhere(expense, expense.month, scope))
        };
    }
}
