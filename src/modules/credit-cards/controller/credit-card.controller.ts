import { Body, Controller, Get, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { CreateCreditCardDto, CreditCardResponse, UpdateCreditCardDto } from '../dto/credit-card.dto';
import { CreateCreditCardPipe, CreditCardIdPipe, UpdateCreditCardPipe } from '../flow/credit-card.pipe';
import { CreditCardService } from '../service/credit-card.service';

@ApiTags('credit-cards')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('credit-cards')
@Roles(Role.USER)
export class CreditCardController {
    public constructor(private readonly creditCardService: CreditCardService) { }

    @Post()
    @ApiOperation({ summary: 'Cadastra um cartão (uma fatura de um banco)' })
    @ApiDataResponse(CreditCardResponse, { status: HttpStatus.CREATED })
    public async create(@Body(CreateCreditCardPipe) body: CreateCreditCardDto): Promise<CreditCardResponse> {
        return this.creditCardService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Lista os cartões ativos' })
    @ApiDataResponse(CreditCardResponse, { isArray: true })
    public async findAll(): Promise<CreditCardResponse[]> {
        return this.creditCardService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Consulta um cartão' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CreditCardResponse)
    public async findById(@Param('id', CreditCardIdPipe) id: string): Promise<CreditCardResponse> {
        return this.creditCardService.findById(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Altera nome ou estado ativo (o banco não muda)' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CreditCardResponse)
    public async update(
        @Param('id', CreditCardIdPipe) id: string,
        @Body(UpdateCreditCardPipe) body: UpdateCreditCardDto
    ): Promise<CreditCardResponse> {
        return this.creditCardService.update(id, body);
    }
}
