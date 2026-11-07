import type { Person } from '../../../generated/prisma/client';
import type { CreatePersonDto, UpdatePersonDto } from '../dto/person.dto';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do PersonRepository */
/**
 * PersonRepository em memória, com a mesma ordenação do banco. Como no Prisma, um campo
 * `undefined` no update não muda nada e `null` apaga o valor.
 */
export class InMemoryPersonRepository {
    public readonly people = new Map<string, Person>();

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). */
    public seed(data: Partial<Person> & Pick<Person, 'name'>): Person {
        const now = new Date();
        const person: Person = {
            id: randomUUID(),
            email: null,
            phone: null,
            active: true,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.people.set(person.id, person);
        return person;
    }

    public async create(data: CreatePersonDto): Promise<Person> {
        return this.seed({ name: data.name, email: data.email ?? null, phone: data.phone ?? null });
    }

    public async findAll(includeInactive: boolean): Promise<Person[]> {
        return [...this.people.values()]
            .filter(person => includeInactive || person.active)
            .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    }

    public async findById(id: string): Promise<Person | null> {
        return this.people.get(id) ?? null;
    }

    public async update(id: string, data: UpdatePersonDto): Promise<Person> {
        const person = this.people.get(id);

        if (!person) {
            // Como o Prisma no update de um id que não existe.
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025', clientVersion: 'teste' });
        }

        const updated: Person = {
            ...person,
            ...(data.name === undefined ? {} : { name: data.name }),
            ...(data.email === undefined ? {} : { email: data.email }),
            ...(data.phone === undefined ? {} : { phone: data.phone }),
            ...(data.active === undefined ? {} : { active: data.active }),
            updatedAt: new Date()
        };
        this.people.set(id, updated);
        return updated;
    }
}
/* eslint-enable @typescript-eslint/require-await */
