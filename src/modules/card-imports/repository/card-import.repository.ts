import type { CardImport, Prisma } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';
import { CardImportPlan, ExistingCardExpense, PlanCardImportInput } from '../service/card-import.planner';

export type CardImportWithCount = CardImport & {
    /** Despesas cuja última gravação veio deste upload. */
    expenseCount: number;
};

const WITH_EXPENSE_COUNT = { _count: { select: { expenses: true } } } satisfies Prisma.CardImportInclude;

export type NewCardImport = {
    cardId: string;
    month: Date;
    fileName: string;
    fileHash: string;
    parserVersion: string;
    rowCount: number;
    ignoredCount: number;
};

export type ApplyCardImportInput = {
    data: NewCardImport;
    purchaseKeys: string[];
    plan: (input: Pick<PlanCardImportInput, 'importId' | 'existing' | 'nextImportedMonth'>) => CardImportPlan;
};

const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;
const EXISTING_EXPENSE_SELECT = {
    id: true,
    month: true,
    sourceMonth: true,
    purchaseKey: true,
    nickname: true,
    categoryId: true,
    personId: true
} satisfies Prisma.CardExpenseSelect;

@Injectable()
export class CardImportRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /**
     * Registra o upload e aplica a conciliação em uma única transação: se qualquer
     * etapa falhar, nenhuma despesa do upload é gravada.
     */
    public async apply(input: ApplyCardImportInput): Promise<{ cardImport: CardImport; plan: CardImportPlan }> {
        return this.prisma.$transaction(async tx => {
            const cardImport = await tx.cardImport.create({ data: input.data });
            const monthRows = await tx.cardExpense.findMany({
                where: { cardId: input.data.cardId, month: input.data.month },
                select: { purchaseKey: true }
            });
            const keys = [...new Set([...input.purchaseKeys, ...monthRows.map(row => row.purchaseKey)])];
            const existing: ExistingCardExpense[] = keys.length === 0 ? [] : await tx.cardExpense.findMany({
                where: { cardId: input.data.cardId, purchaseKey: { in: keys } },
                select: EXISTING_EXPENSE_SELECT
            });
            const nextImport = await tx.cardImport.findFirst({
                where: { cardId: input.data.cardId, month: { gt: input.data.month } },
                orderBy: { month: 'asc' },
                select: { month: true }
            });
            const plan = input.plan({
                importId: cardImport.id,
                existing,
                nextImportedMonth: nextImport?.month ?? null
            });

            if (plan.deleteIds.length > 0) {
                await tx.cardExpense.deleteMany({ where: { id: { in: plan.deleteIds } } });
            }

            for (const update of plan.updates) {
                await tx.cardExpense.update({ where: { id: update.id }, data: update.data });
            }

            if (plan.creates.length > 0) {
                await tx.cardExpense.createMany({ data: plan.creates });
            }

            return { cardImport, plan };
        }, { timeout: IMPORT_TRANSACTION_TIMEOUT_MS });
    }

    public async findAll(filter: { cardId?: string; month?: Date }): Promise<CardImportWithCount[]> {
        const imports = await this.prisma.cardImport.findMany({
            where: filter,
            include: WITH_EXPENSE_COUNT,
            orderBy: [
                { createdAt: 'desc' },
                { id: 'asc' }
            ]
        });

        return imports.map(({ _count: count, ...cardImport }) => ({ ...cardImport, expenseCount: count.expenses }));
    }

    public async findById(id: string): Promise<CardImportWithCount | null> {
        const found = await this.prisma.cardImport.findUnique({
            where: { id },
            include: WITH_EXPENSE_COUNT
        });

        if (!found) {
            return null;
        }

        const { _count: count, ...cardImport } = found;

        return { ...cardImport, expenseCount: count.expenses };
    }

    /** Remove o upload; as despesas gravadas por ele saem junto (onDelete: Cascade). */
    public async delete(id: string): Promise<void> {
        await this.prisma.cardImport.delete({ where: { id } });
    }
}
