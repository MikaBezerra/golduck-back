import type {
    ExpenseSplit,
    ManualExpense,
    Prisma
} from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';

type NewManualExpense = {
    month: Date;
    title: string;
    amountCents: bigint;
    split: ExpenseSplit;
    personId: string | null;
};

type ManualExpenseChanges = {
    title?: string;
    amountCents?: bigint;
    split?: ExpenseSplit;
    personId?: string | null;
    paidAt?: Date | null;
};

@Injectable()
export class ManualExpenseRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async createMany(
        entries: NewManualExpense[]
    ): Promise<ManualExpense[]> {
        return this.prisma.manualExpense.createManyAndReturn({
            data: entries
        });
    }

    public async findAllByMonth(month: Date): Promise<ManualExpense[]> {
        return this.prisma.manualExpense.findMany({
            where: { month },
            orderBy: [
                { title: 'asc' },
                { id: 'asc' }
            ]
        });
    }

    public async findById(id: string): Promise<ManualExpense | null> {
        return this.prisma.manualExpense.findUnique({
            where: { id }
        });
    }

    public async updateManyByIds(
        ids: string[],
        changes: ManualExpenseChanges
    ): Promise<ManualExpense[]> {
        const operations: Prisma.PrismaPromise<ManualExpense>[] = [];

        for (const id of ids) {
            operations.push(
                this.prisma.manualExpense.update({
                    where: { id },
                    data: changes
                })
            );
        }

        return this.prisma.$transaction(operations);
    }

    public async deleteManyByIds(ids: string[]): Promise<ManualExpense[]> {
        const operations: Prisma.PrismaPromise<ManualExpense>[] = [];

        for (const id of ids) {
            operations.push(
                this.prisma.manualExpense.delete({
                    where: { id }
                })
            );
        }

        return this.prisma.$transaction(operations);
    }
}
