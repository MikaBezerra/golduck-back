import type { Category } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';

@Injectable()
export class CategoryRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async create(name: string, nameKey: string): Promise<Category> {
        return this.prisma.category.create({ data: { name, nameKey } });
    }

    public async findAll(): Promise<Category[]> {
        return this.prisma.category.findMany({
            where: { active: true },
            orderBy: { name: 'asc' }
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
}
