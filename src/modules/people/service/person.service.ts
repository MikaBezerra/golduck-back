import type { Person } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';
import { CreatePersonDto, PersonResponse, UpdatePersonDto } from '../dto/person.dto.js';
import { PERSON_ERRORS } from '../errors/person.errors.js';
import { PersonRepository } from '../repository/person.repository.js';

@Injectable()
export class PersonService {
    public constructor(
        private readonly personRepository: PersonRepository
    ) { }

    public async create(data: CreatePersonDto): Promise<PersonResponse> {
        return this.toResponse(await this.personRepository.create(data));
    }

    public async findAll(includeInactive = false): Promise<PersonResponse[]> {
        const people = await this.personRepository.findAll(includeInactive);

        return people.map(person => this.toResponse(person));
    }

    public async findById(id: string): Promise<PersonResponse> {
        const person = await this.personRepository.findById(id);

        if (!person) {
            throw PERSON_ERRORS.notFound('person_id_not_found');
        }

        return this.toResponse(person);
    }

    public async update(id: string, data: UpdatePersonDto): Promise<PersonResponse> {
        await this.findById(id);

        return this.toResponse(await this.personRepository.update(id, data));
    }

    private toResponse(person: Person): PersonResponse {
        return {
            id: person.id,
            name: person.name,
            email: person.email,
            phone: person.phone,
            active: person.active,
            createdAt: person.createdAt,
            updatedAt: person.updatedAt
        };
    }
}
