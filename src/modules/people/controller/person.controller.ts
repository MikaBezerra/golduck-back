import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { CreatePersonDto, ListPeopleDto, PersonResponse, UpdatePersonDto } from '../dto/person.dto';
import { CreatePersonPipe, ListPeoplePipe, PersonIdPipe, UpdatePersonPipe } from '../flow/person.pipe';
import { PersonService } from '../service/person.service';

@ApiTags('people')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('people')
@Roles(Role.USER)
export class PersonController {
    public constructor(
        private readonly personService: PersonService
    ) { }

    @Post()
    @ApiOperation({ summary: 'Cadastra uma pessoa' })
    @ApiDataResponse(PersonResponse, { status: HttpStatus.CREATED })
    public async create(
        @Body(CreatePersonPipe) body: CreatePersonDto
    ): Promise<PersonResponse> {
        return this.personService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Lista as pessoas (só as ativas, salvo includeInactive=true)' })
    @ApiDataResponse(PersonResponse, { isArray: true })
    public async findAll(
        @Query(ListPeoplePipe) query: ListPeopleDto
    ): Promise<PersonResponse[]> {
        return this.personService.findAll(query.includeInactive);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Consulta uma pessoa, ativa ou não' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(PersonResponse)
    public async findById(
        @Param('id', PersonIdPipe) id: string
    ): Promise<PersonResponse> {
        return this.personService.findById(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Altera nome, contatos ou estado ativo' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(PersonResponse)
    public async update(
        @Param('id', PersonIdPipe) id: string,
        @Body(UpdatePersonPipe) body: UpdatePersonDto
    ): Promise<PersonResponse> {
        return this.personService.update(id, body);
    }
}
