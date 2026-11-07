import type { CardBank, CreditCard } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common';

@Injectable()
export class CreditCardRepository {
    public constructor(private readonly prisma: PrismaService) { }

    public async create(data: { name: string; bank: CardBank }): Promise<CreditCard> {
        return this.prisma.creditCard.create({ data });
    }

    public async findAll(): Promise<CreditCard[]> {
        return this.prisma.creditCard.findMany({
            where: { active: true },
            orderBy: [
                { name: 'asc' },
                { id: 'asc' }
            ]
        });
    }

    public async findById(id: string): Promise<CreditCard | null> {
        return this.prisma.creditCard.findUnique({ where: { id } });
    }

    public async update(id: string, data: { name?: string; active?: boolean }): Promise<CreditCard> {
        return this.prisma.creditCard.update({ where: { id }, data });
    }
}
