import type { Category } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';

@Injectable()
export class CategoryRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async create(name: string, nameKey: string): Promise<Category> {
        return this.prisma.category.create({ data: { name, nameKey } });
    }

    /** Sem includeInactive, só as ativas; com ele, todas (ativas primeiro). */
    public async findAll(includeInactive: boolean): Promise<Category[]> {
        return this.prisma.category.findMany({
            where: includeInactive ? undefined : { active: true },
            orderBy: includeInactive
                ? [{ active: 'desc' }, { name: 'asc' }]
                : { name: 'asc' }
        });
    }

    public async findById(id: string): Promise<Category | null> {
        return this.prisma.category.findUnique({ where: { id } });
    }

    public async findByNameKey(nameKey: string): Promise<Category | null> {
        return this.prisma.category.findUnique({ where: { nameKey } });
    }

    public async findDefault(): Promise<Category | null> {
        return this.prisma.category.findFirst({ where: { isDefault: true } });
    }

    public async update(id: string, data: { name?: string; nameKey?: string; active?: boolean }): Promise<Category> {
        return this.prisma.category.update({ where: { id }, data });
    }

    /**
     * Passa as compras do cartão (inclusive as excluídas) para targetId e apaga a categoria, numa
     * transação. Devolve quantas compras mudaram de categoria.
     */
    public async deleteMovingCardExpenses(id: string, targetId: string): Promise<number> {
        return this.prisma.$transaction(async tx => {
            const card = await tx.cardExpense.updateMany({ where: { categoryId: id }, data: { categoryId: targetId } });

            await tx.category.delete({ where: { id } });

            return card.count;
        });
    }
}
