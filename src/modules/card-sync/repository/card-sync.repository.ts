import type { CardExpense, CardPurchaseCorrection, Prisma } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';
import { CardSyncPlan } from '../service/card-sync.planner.js';

/** O que o plano precisa ler do banco. */
export type CardSyncContext = {
    existing: CardExpense[];
    corrections: CardPurchaseCorrection[];
};

const SYNC_TRANSACTION_TIMEOUT_MS = 30_000;

@Injectable()
export class CardSyncRepository {
    public constructor(private readonly prisma: PrismaService) { }

    /**
     * Lê o contexto e grava o plano numa única transação: se qualquer etapa falhar, nada muda.
     * O contexto são as linhas do cartão a partir de syncFromMonth e as das compras sincronizadas
     * (em qualquer mês, para herdar apelido, categoria e pessoa).
     */
    public async apply(
        input: { cardId: string; syncFromMonth: Date; purchaseKeys: string[] },
        plan: (context: CardSyncContext) => CardSyncPlan
    ): Promise<CardSyncPlan> {
        return this.prisma.$transaction(async tx => {
            const context = await this.readContext(tx, input);
            const result = plan(context);

            if (result.deleteIds.length > 0) {
                await tx.cardExpense.deleteMany({ where: { id: { in: result.deleteIds } } });
            }

            for (const update of result.updates) {
                await tx.cardExpense.update({ where: { id: update.id }, data: update.data });
            }

            if (result.creates.length > 0) {
                await tx.cardExpense.createMany({ data: result.creates });
            }

            return result;
        }, { timeout: SYNC_TRANSACTION_TIMEOUT_MS });
    }

    private async readContext(
        client: Prisma.TransactionClient,
        input: { cardId: string; syncFromMonth: Date; purchaseKeys: string[] }
    ): Promise<CardSyncContext> {
        const existing = await client.cardExpense.findMany({
            where: {
                cardId: input.cardId,
                OR: [
                    { month: { gte: input.syncFromMonth } },
                    { purchaseKey: { in: input.purchaseKeys } }
                ]
            }
        });
        const corrections = await client.cardPurchaseCorrection.findMany({ where: { cardId: input.cardId } });

        return { existing, corrections };
    }
}
