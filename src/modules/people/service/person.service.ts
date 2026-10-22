import type { Person } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { CreatePersonDto, UpdatePersonDto } from '../dto/person.dto';
import { PERSON_ERRORS } from '../errors/person.errors';
import { PersonRepository } from '../repository/person.repository';

@Injectable()
export class PersonService {
    public constructor(
        private readonly personRepository: PersonRepository
    ) { }

    public async create(data: CreatePersonDto): Promise<Person> {
        return this.personRepository.create(data);
    }

    public async findAll(): Promise<Person[]> {
        return this.personRepository.findAll();
    }

    public async findById(id: string): Promise<Person> {
        const person = await this.personRepository.findById(id);

        if (!person) {
            throw PERSON_ERRORS.notFound('person_id_not_found');
        }

        return person;
    }

    public async update(id: string, data: UpdatePersonDto): Promise<Person> {
        await this.findById(id);

        return this.personRepository.update(id, data);
    }
}
