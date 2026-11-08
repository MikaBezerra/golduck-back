import type { Category } from '../../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client.js';

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do CategoryRepository */
/** CategoryRepository em memória, com a mesma ordenação e a mesma unicidade de nome do banco. */
export class InMemoryCategoryRepository {
    public readonly categories = new Map<string, Category>();

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). */
    public seed(data: Partial<Category> & Pick<Category, 'name'>): Category {
        const now = new Date();
        const category: Category = {
            id: randomUUID(),
            nameKey: data.name.toLocaleLowerCase('pt-BR'),
            active: true,
            isDefault: false,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.categories.set(category.id, category);
        return category;
    }

    public async create(name: string, nameKey: string): Promise<Category> {
        this.assertUniqueNameKey(nameKey);
        return this.seed({ name, nameKey });
    }

    public async findAll(includeInactive: boolean): Promise<Category[]> {
        return [...this.categories.values()]
            .filter(category => includeInactive || category.active)
            .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    }

    public async findById(id: string): Promise<Category | null> {
        return this.categories.get(id) ?? null;
    }

    public async findByNameKey(nameKey: string): Promise<Category | null> {
        return [...this.categories.values()].find(category => category.nameKey === nameKey) ?? null;
    }

    public async findDefault(): Promise<Category | null> {
        return [...this.categories.values()].find(category => category.isDefault) ?? null;
    }

    public async update(id: string, data: { name?: string; nameKey?: string; active?: boolean }): Promise<Category> {
        const category = this.categories.get(id);

        if (!category) {
            throw new Error(`categoria ${id} não existe`);
        }

        if (data.nameKey !== undefined && data.nameKey !== category.nameKey) {
            this.assertUniqueNameKey(data.nameKey);
        }

        const updated: Category = {
            ...category,
            ...(data.name === undefined ? {} : { name: data.name }),
            ...(data.nameKey === undefined ? {} : { nameKey: data.nameKey }),
            ...(data.active === undefined ? {} : { active: data.active }),
            updatedAt: new Date()
        };
        this.categories.set(id, updated);
        return updated;
    }

    /** Como o índice único do banco: o Prisma lança P2002. */
    private assertUniqueNameKey(nameKey: string): void {
        if ([...this.categories.values()].some(category => category.nameKey === nameKey)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' });
        }
    }
}
/* eslint-enable @typescript-eslint/require-await */
