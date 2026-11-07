import type { Person } from '../../../generated/prisma/client';
import { randomUUID } from 'node:crypto';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do PersonRepository */
/**
 * Só a parte do PersonRepository que as despesas usam (findById), em memória. O cadastro de
 * pessoas tem os próprios testes; este fake mínimo fica aqui para as despesas não dependerem deles.
 * Também é usado pelos testes de card-expenses.
 */
export class FakePersonRepository {
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

    public async findById(id: string): Promise<Person | null> {
        return this.people.get(id) ?? null;
    }
}
/* eslint-enable @typescript-eslint/require-await */
