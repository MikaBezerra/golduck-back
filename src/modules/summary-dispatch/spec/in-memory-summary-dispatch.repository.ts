import type { InMemorySummaryRepository } from '../../summary/spec/in-memory-summary.repository.js';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';

import { MailMessage, SummaryMailer } from '../mail/summary-mailer.js';
import { DispatchItemData, DispatchWithItems, PersonContact } from '../repository/summary-dispatch.repository.js';

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' });

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do SummaryDispatchRepository */
/**
 * SummaryDispatchRepository em memória. Imita os índices únicos do banco (idempotencyKey e
 * runningMonth) lançando P2002, e lê os contatos das pessoas do InMemorySummaryRepository.
 */
export class InMemorySummaryDispatchRepository {
    public readonly dispatches: DispatchWithItems[] = [];

    public constructor(private readonly summary: InMemorySummaryRepository) { }

    /** Grava um envio pronto (por exemplo, um preso em RUNNING há muito tempo). */
    public seed(data: Partial<DispatchWithItems> & Pick<DispatchWithItems, 'month' | 'idempotencyKey'>): DispatchWithItems {
        const dispatch: DispatchWithItems = {
            id: randomUUID(),
            channel: 'EMAIL',
            status: 'DONE',
            runningMonth: null,
            startedAt: new Date(),
            finishedAt: new Date(),
            items: [],
            ...data
        };
        this.dispatches.push(dispatch);
        return dispatch;
    }

    public async findByKey(idempotencyKey: string): Promise<DispatchWithItems | null> {
        return this.copy(this.dispatches.find(dispatch => dispatch.idempotencyKey === idempotencyKey));
    }

    public async findByMonth(month: Date, take: number): Promise<DispatchWithItems[]> {
        return this.dispatches
            .filter(dispatch => dispatch.month.getTime() === month.getTime())
            .sort((first, second) => second.startedAt.getTime() - first.startedAt.getTime())
            .slice(0, take)
            .map(dispatch => this.copy(dispatch) as DispatchWithItems);
    }

    public async findContacts(ids: string[]): Promise<PersonContact[]> {
        return [...this.summary.people.values()]
            .filter(person => ids.includes(person.id))
            .map(person => ({ id: person.id, name: person.name, email: person.email }));
    }

    public async releaseStale(month: Date, startedBefore: Date): Promise<number> {
        const stale = this.dispatches.filter(dispatch =>
            dispatch.runningMonth?.getTime() === month.getTime() && dispatch.startedAt < startedBefore);

        for (const dispatch of stale) {
            Object.assign(dispatch, { runningMonth: null, status: 'INTERRUPTED', finishedAt: new Date() });
        }

        return stale.length;
    }

    public async start(month: Date, idempotencyKey: string): Promise<DispatchWithItems> {
        if (this.dispatches.some(dispatch =>
            dispatch.idempotencyKey === idempotencyKey || dispatch.runningMonth?.getTime() === month.getTime())) {
            throw uniqueViolation();
        }

        // Um milissegundo a mais por envio, para a ordem por startedAt ser estável nos testes.
        const startedAt = new Date(Date.now() + this.dispatches.length);

        return this.copy(this.seed({ month, idempotencyKey, runningMonth: month, status: 'RUNNING', startedAt, finishedAt: null })) as DispatchWithItems;
    }

    public async addItem(dispatchId: string, item: DispatchItemData): Promise<void> {
        this.find(dispatchId).items.push({ id: randomUUID(), dispatchId, createdAt: new Date(), ...item });
    }

    public async finish(id: string, status: 'DONE' | 'INTERRUPTED'): Promise<DispatchWithItems> {
        const dispatch = this.find(id);

        Object.assign(dispatch, { status, runningMonth: null, finishedAt: new Date() });

        return this.copy(dispatch) as DispatchWithItems;
    }

    private find(id: string): DispatchWithItems {
        const dispatch = this.dispatches.find(item => item.id === id);

        if (!dispatch) {
            throw new Error(`envio ${id} não existe`);
        }

        return dispatch;
    }

    /** Cópia com os itens em ordem alfabética, como o include do repositório real. */
    private copy(dispatch: DispatchWithItems | undefined): DispatchWithItems | null {
        return dispatch
            ? { ...dispatch, items: [...dispatch.items].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')) }
            : null;
    }
}
/* eslint-enable @typescript-eslint/require-await */

/** Mailer falso: guarda o que "enviou" e falha quando mandado (por destinatário ou no verify). */
export class FakeSummaryMailer extends SummaryMailer {
    public enabled = true;
    public readonly sent: MailMessage[] = [];
    /** Destinatário → erro lançado no envio para ele. */
    public readonly failures = new Map<string, Error>();
    public verifyError: Error | null = null;

    public async verify(): Promise<void> {
        return this.verifyError === null ? Promise.resolve() : Promise.reject(this.verifyError);
    }

    public async send(message: MailMessage): Promise<void> {
        const failure = this.failures.get(message.to);

        if (failure) {
            return Promise.reject(failure);
        }

        this.sent.push(message);

        return Promise.resolve();
    }
}
