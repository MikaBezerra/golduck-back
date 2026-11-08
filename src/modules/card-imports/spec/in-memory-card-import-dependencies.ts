import type { CreditCard, Person } from '../../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

import { CardBank } from '../../../generated/prisma/client.js';

/*
 * Repositórios mínimos dos módulos de que o upload de faturas depende (cartões e pessoas). O
 * upload só consulta por id; o resto da interface fica de fora de propósito. A categoria usa o
 * InMemoryCategoryRepository do módulo de categorias.
 */

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona dos repositórios reais */
export class InMemoryCreditCardRepository {
    public readonly cards = new Map<string, CreditCard>();

    public seed(data: Partial<CreditCard> = {}): CreditCard {
        const card: CreditCard = {
            id: randomUUID(),
            name: 'Cartão de teste',
            bank: CardBank.NUBANK,
            active: true,
            dueDay: null,
            bestPurchaseDay: null,
            pluggyItemId: null,
            pluggyAccountId: null,
            syncFromMonth: null,
            syncedAt: null,
            syncDataUpdatedAt: null,
            syncStatus: null,
            syncError: null,
            syncConsentExpiresAt: null,
            createdAt: FIXED_DATE,
            updatedAt: FIXED_DATE,
            ...data
        };
        this.cards.set(card.id, card);
        return card;
    }

    public async findById(id: string): Promise<CreditCard | null> {
        return this.cards.get(id) ?? null;
    }
}

export class InMemoryPersonRepository {
    public readonly people = new Map<string, Person>();

    public seed(data: Partial<Person> = {}): Person {
        const person: Person = {
            id: randomUUID(),
            name: 'Pessoa de teste',
            email: null,
            phone: null,
            active: true,
            createdAt: FIXED_DATE,
            updatedAt: FIXED_DATE,
            ...data
        };
        this.people.set(person.id, person);
        return person;
    }

    public async findById(id: string): Promise<Person | null> {
        return this.people.get(id) ?? null;
    }
}
/* eslint-enable @typescript-eslint/require-await */
