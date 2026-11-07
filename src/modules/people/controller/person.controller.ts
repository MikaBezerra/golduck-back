import type { Person } from '../../../generated/prisma/client';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { CreatePersonDto, ListPeopleDto, UpdatePersonDto } from '../dto/person.dto';
import { CreatePersonPipe, ListPeoplePipe, PersonIdPipe, UpdatePersonPipe } from '../flow/person.pipe';
import { PersonService } from '../service/person.service';

@Controller('people')
@Roles(Role.USER)
export class PersonController {
    public constructor(
        private readonly personService: PersonService
    ) { }

    @Post()
    public async create(
        @Body(CreatePersonPipe) body: CreatePersonDto
    ): Promise<Person> {
        return this.personService.create(body);
    }

    @Get()
    public async findAll(
        @Query(ListPeoplePipe) query: ListPeopleDto
    ): Promise<Person[]> {
        return this.personService.findAll(query.includeInactive);
    }

    @Get(':id')
    public async findById(
        @Param('id', PersonIdPipe) id: string
    ): Promise<Person> {
        return this.personService.findById(id);
    }

    @Patch(':id')
    public async update(
        @Param('id', PersonIdPipe) id: string,
        @Body(UpdatePersonPipe) body: UpdatePersonDto
    ): Promise<Person> {
        return this.personService.update(id, body);
    }
}
