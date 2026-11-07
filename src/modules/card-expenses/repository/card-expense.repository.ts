import type { CardExpense, Prisma } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';

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

    public async findAll(filter: { month: Date; cardId?: string }): Promise<CardExpense[]> {
        return this.prisma.cardExpense.findMany({
            where: filter,
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
}
