import type { CardExpense, Prisma } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';
import { CardExpenseScope, purchaseScopeWhere } from '../service/card-expense-scope.js';

export type CardExpenseChanges = {
    nickname?: string | null;
    categoryId?: string;
    personId?: string | null;
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
