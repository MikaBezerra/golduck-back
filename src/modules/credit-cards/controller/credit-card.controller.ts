import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import {
    CreateCreditCardDto,
    CreditCardBillResponse,
    CreditCardBillStatusResponse,
    CreditCardResponse,
    ListCreditCardBillsDto,
    UpdateCreditCardBillDto,
    UpdateCreditCardDto
} from '../dto/credit-card.dto.js';
import {
    CreateCreditCardPipe,
    CreditCardBillMonthPipe,
    CreditCardIdPipe,
    ListCreditCardBillsPipe,
    UpdateCreditCardBillPipe,
    UpdateCreditCardPipe
} from '../flow/credit-card.pipe.js';
import { CreditCardService } from '../service/credit-card.service.js';

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
    @ApiOperation({
        summary: 'Altera nome, estado ativo, ciclo da fatura ou a ligação com o Meu Pluggy (o banco não muda)'
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CreditCardResponse)
    public async update(
        @Param('id', CreditCardIdPipe) id: string,
        @Body(UpdateCreditCardPipe) body: UpdateCreditCardDto
    ): Promise<CreditCardResponse> {
        return this.creditCardService.update(id, body);
    }

    @Get(':id/bills')
    @ApiOperation({
        summary: 'Lista as faturas do cartão: início, fechamento, melhor dia e vencimento',
        description: 'Exige o dia do vencimento e o melhor dia de compra configurados (409 CREDIT_CARD_BILLING_NOT_CONFIGURED).'
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CreditCardBillResponse, { isArray: true })
    public async listBills(
        @Param('id', CreditCardIdPipe) id: string,
        @Query(ListCreditCardBillsPipe) query: ListCreditCardBillsDto
    ): Promise<CreditCardBillResponse[]> {
        return this.creditCardService.listBills(id, query);
    }

    @Put(':id/bills/:month')
    @ApiOperation({
        summary: 'Ajusta o melhor dia de compra de uma fatura',
        description: 'Vale até o banco informar o fechamento. Para reorganizar as compras já gravadas, sincronize o cartão depois.'
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiParam({ name: 'month', example: '2026-12', description: 'Mês da fatura, AAAA-MM' })
    @ApiDataResponse(CreditCardBillResponse)
    public async updateBill(
        @Param('id', CreditCardIdPipe) id: string,
        @Param('month', CreditCardBillMonthPipe) month: string,
        @Body(UpdateCreditCardBillPipe) body: UpdateCreditCardBillDto
    ): Promise<CreditCardBillResponse> {
        return this.creditCardService.updateBill(id, month, body);
    }

    @Put(':id/bills/:month/payment')
    @ApiOperation({
        summary: 'Marca a fatura como paga',
        description: 'Só depois do fechamento (409 CREDIT_CARD_BILL_NOT_CLOSED). Guarda o total do momento; '
            + 'se a fatura mudar depois, changedAfterPayment avisa, e marcar de novo confirma o valor novo.'
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiParam({ name: 'month', example: '2026-11', description: 'Mês da fatura, AAAA-MM' })
    @ApiDataResponse(CreditCardBillStatusResponse)
    public async markBillPaid(
        @Param('id', CreditCardIdPipe) id: string,
        @Param('month', CreditCardBillMonthPipe) month: string
    ): Promise<CreditCardBillStatusResponse> {
        return this.creditCardService.markBillPaid(id, month);
    }

    @Delete(':id/bills/:month/payment')
    @ApiOperation({ summary: 'Desmarca o pagamento da fatura' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiParam({ name: 'month', example: '2026-11', description: 'Mês da fatura, AAAA-MM' })
    @ApiDataResponse(CreditCardBillStatusResponse)
    public async unmarkBillPaid(
        @Param('id', CreditCardIdPipe) id: string,
        @Param('month', CreditCardBillMonthPipe) month: string
    ): Promise<CreditCardBillStatusResponse> {
        return this.creditCardService.unmarkBillPaid(id, month);
    }
}
