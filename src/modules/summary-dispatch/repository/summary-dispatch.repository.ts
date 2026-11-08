import type { Prisma, SummaryDispatch, SummaryDispatchItem } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';

export type DispatchWithItems = SummaryDispatch & { items: SummaryDispatchItem[] };

export type DispatchItemData = Pick<SummaryDispatchItem, 'personId' | 'name' | 'recipient' | 'status' | 'errorCode' | 'message'>;

export type PersonContact = { id: string; name: string; email: string | null };

/** Itens em ordem alfabética (a mesma das pessoas no resumo). */
const WITH_ITEMS = { items: { orderBy: [{ name: 'asc' as const }, { createdAt: 'asc' as const }] } } satisfies Prisma.SummaryDispatchInclude;

@Injectable()
export class SummaryDispatchRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async findByKey(idempotencyKey: string): Promise<DispatchWithItems | null> {
        return this.prisma.summaryDispatch.findUnique({ where: { idempotencyKey }, include: WITH_ITEMS });
    }

    /** Envios do mês, do mais recente para o mais antigo. */
    public async findByMonth(month: Date, take: number): Promise<DispatchWithItems[]> {
        return this.prisma.summaryDispatch.findMany({ where: { month }, orderBy: { startedAt: 'desc' }, take, include: WITH_ITEMS });
    }

    public async findContacts(ids: string[]): Promise<PersonContact[]> {
        return ids.length === 0
            ? []
            : this.prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
    }

    /**
     * Libera um envio do mês que ficou preso em RUNNING (a função caiu no meio): marca como INTERRUPTED
     * e solta o runningMonth, para o novo envio poder começar.
     */
    public async releaseStale(month: Date, startedBefore: Date): Promise<number> {
        const result = await this.prisma.summaryDispatch.updateMany({
            where: { runningMonth: month, startedAt: { lt: startedBefore } },
            data: { runningMonth: null, status: 'INTERRUPTED', finishedAt: new Date() }
        });

        return result.count;
    }

    /**
     * Começa um envio. Falha com P2002 se a chave já existe ou se já há um envio do mês rodando
     * (runningMonth único).
     */
    public async start(month: Date, idempotencyKey: string): Promise<DispatchWithItems> {
        return this.prisma.summaryDispatch.create({ data: { month, runningMonth: month, idempotencyKey }, include: WITH_ITEMS });
    }

    public async addItem(dispatchId: string, item: DispatchItemData): Promise<void> {
        await this.prisma.summaryDispatchItem.create({ data: { dispatchId, ...item } });
    }

    public async finish(id: string, status: 'DONE' | 'INTERRUPTED'): Promise<DispatchWithItems> {
        return this.prisma.summaryDispatch.update({
            where: { id },
            data: { status, runningMonth: null, finishedAt: new Date() },
            include: WITH_ITEMS
        });
    }
}
