import type { Person } from '../../../generated/prisma/client';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { CreatePersonDto, UpdatePersonDto } from '../dto/person.dto';
import { CreatePersonPipe, PersonIdPipe, UpdatePersonPipe } from '../flow/person.pipe';
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
    public async findAll(): Promise<Person[]> {
        return this.personService.findAll();
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
