import type { CardExpense, CardImport, Prisma } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';
import { CardImportPlan } from '../service/card-import.planner';

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

/** O que o banco precisa informar para montar o plano de um upload (só leituras). */
export type PlanningContext = {
    /** Linhas do cartão cujas chaves aparecem no arquivo ou no mês do upload. */
    existing: CardExpense[];
    /** Primeiro mês posterior com upload próprio no cartão. */
    nextImportedMonth: Date | null;
};

export type ApplyCardImportInput = {
    data: NewCardImport;
    purchaseKeys: string[];
    plan: (context: PlanningContext) => CardImportPlan;
};

const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;

@Injectable()
export class CardImportRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /** Lê o contexto do plano sem gravar nada (usado pela pré-visualização). */
    public async loadPlanningContext(cardId: string, month: Date, purchaseKeys: string[]): Promise<PlanningContext> {
        return this.readPlanningContext(this.prisma, cardId, month, purchaseKeys);
    }

    /**
     * Registra o upload e aplica a conciliação em uma única transação: o contexto é
     * lido dentro dela e, se qualquer etapa falhar, nada do upload é gravado.
     */
    public async apply(input: ApplyCardImportInput): Promise<{ cardImport: CardImport; plan: CardImportPlan }> {
        return this.prisma.$transaction(async tx => {
            const cardImport = await tx.cardImport.create({ data: input.data });
            const context = await this.readPlanningContext(tx, input.data.cardId, input.data.month, input.purchaseKeys);
            const plan = input.plan(context);
            const importId = cardImport.id;

            if (plan.deleteIds.length > 0) {
                await tx.cardExpense.deleteMany({ where: { id: { in: plan.deleteIds } } });
            }

            for (const update of plan.updates) {
                await tx.cardExpense.update({ where: { id: update.id }, data: { ...update.data, importId } });
            }

            if (plan.creates.length > 0) {
                await tx.cardExpense.createMany({ data: plan.creates.map(row => ({ ...row, importId })) });
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

    private async readPlanningContext(
        client: Prisma.TransactionClient,
        cardId: string,
        month: Date,
        purchaseKeys: string[]
    ): Promise<PlanningContext> {
        const monthRows = await client.cardExpense.findMany({
            where: { cardId, month },
            select: { purchaseKey: true }
        });
        const keys = [...new Set([...purchaseKeys, ...monthRows.map(row => row.purchaseKey)])];
        const existing = keys.length === 0 ? [] : await client.cardExpense.findMany({
            where: { cardId, purchaseKey: { in: keys } }
        });
        const nextImport = await client.cardImport.findFirst({
            where: { cardId, month: { gt: month } },
            orderBy: { month: 'asc' },
            select: { month: true }
        });

        return { existing, nextImportedMonth: nextImport?.month ?? null };
    }
}
