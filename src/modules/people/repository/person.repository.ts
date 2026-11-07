import type { Person } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common';
import { CreatePersonDto, UpdatePersonDto } from '../dto/person.dto';

@Injectable()
export class PersonRepository {
    public constructor(
        private readonly prisma: PrismaService
    ) { }

    public async create(data: CreatePersonDto): Promise<Person> {
        return this.prisma.person.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone
            }
        });
    }

    /** Sem includeInactive, só as ativas; com ele, todas (ativas primeiro). */
    public async findAll(includeInactive: boolean): Promise<Person[]> {
        return this.prisma.person.findMany({
            where: includeInactive ? undefined : { active: true },
            orderBy: includeInactive
                ? [{ active: 'desc' }, { name: 'asc' }]
                : [{ name: 'asc' }]
        });
    }

    public async findById(id: string): Promise<Person | null> {
        return this.prisma.person.findUnique({
            where: {
                id
            }
        });
    }

    public async update(id: string, data: UpdatePersonDto): Promise<Person> {
        return this.prisma.person.update({
            where: { id },
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                active: data.active
            }
        });
    }
}
