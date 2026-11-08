import type { Category } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/index.js';

/** Quantas despesas foram para a outra categoria quando a categoria foi excluída. */
export type MovedExpenses = {
    manualExpenses: number;
    cardExpenses: number;
};

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
     * Passa as despesas (fora do cartão e do cartão, inclusive as excluídas) para targetId e apaga a
     * categoria, numa transação.
     */
    public async deleteMovingExpenses(id: string, targetId: string): Promise<MovedExpenses> {
        return this.prisma.$transaction(async tx => {
            const manual = await tx.manualExpense.updateMany({ where: { categoryId: id }, data: { categoryId: targetId } });
            const card = await tx.cardExpense.updateMany({ where: { categoryId: id }, data: { categoryId: targetId } });

            await tx.category.delete({ where: { id } });

            return { manualExpenses: manual.count, cardExpenses: card.count };
        });
    }
}
