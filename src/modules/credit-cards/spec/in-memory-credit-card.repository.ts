import type { CardBank, CreditCard } from '../../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client.js';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do CreditCardRepository */
/**
 * CreditCardRepository em memória, com a mesma ordenação do banco (nome e, no empate, id). Como no
 * Prisma, um campo `undefined` no update não muda nada.
 */
export class InMemoryCreditCardRepository {
    public readonly cards = new Map<string, CreditCard>();

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). */
    public seed(data: Partial<CreditCard> & Pick<CreditCard, 'name'>): CreditCard {
        const now = new Date();
        const card: CreditCard = {
            id: randomUUID(),
            bank: 'NUBANK',
            active: true,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.cards.set(card.id, card);
        return card;
    }

    public async create(data: { name: string; bank: CardBank }): Promise<CreditCard> {
        return this.seed({ name: data.name, bank: data.bank });
    }

    public async findAll(): Promise<CreditCard[]> {
        return [...this.cards.values()]
            .filter(card => card.active)
            .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
    }

    public async findById(id: string): Promise<CreditCard | null> {
        return this.cards.get(id) ?? null;
    }

    public async update(id: string, data: { name?: string; active?: boolean }): Promise<CreditCard> {
        const card = this.cards.get(id);

        if (!card) {
            // Como o Prisma no update de um id que não existe.
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025', clientVersion: 'teste' });
        }

        const updated: CreditCard = {
            ...card,
            ...(data.name === undefined ? {} : { name: data.name }),
            ...(data.active === undefined ? {} : { active: data.active }),
            updatedAt: new Date()
        };
        this.cards.set(id, updated);
        return updated;
    }
}
/* eslint-enable @typescript-eslint/require-await */

/** Ordem de texto simples, como o ORDER BY por código do banco. */
function compareText(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
}
