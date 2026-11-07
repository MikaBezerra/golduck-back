import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { CardExpenseResponse, ListCardExpensesDto, UpdateCardExpensesDto } from '../dto/card-expense.dto';
import { CardExpenseIdPipe, ListCardExpensesPipe, UpdateCardExpensesPipe } from '../flow/card-expense.pipe';
import { CardExpenseService } from '../service/card-expense.service';

/** Despesas do cartão são criadas e removidas somente pelos uploads de fatura. */
@ApiTags('card-expenses')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('card-expenses')
@Roles(Role.USER)
export class CardExpenseController {
    public constructor(private readonly cardExpenseService: CardExpenseService) { }

    @Get()
    @ApiOperation({ summary: 'Lista as despesas do cartão em um mês de fatura' })
    @ApiDataResponse(CardExpenseResponse, { isArray: true })
    public async findAll(
        @Query(ListCardExpensesPipe) query: ListCardExpensesDto
    ): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Consulta uma despesa do cartão' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CardExpenseResponse)
    public async findById(@Param('id', CardExpenseIdPipe) id: string): Promise<CardExpenseResponse> {
        return this.cardExpenseService.findById(id);
    }

    @Patch()
    @ApiOperation({
        summary: 'Altera apelido, categoria ou pessoa',
        description: 'Em compras parceladas, vale também para as parcelas seguintes. Devolve todas as linhas alteradas.'
    })
    @ApiDataResponse(CardExpenseResponse, { isArray: true })
    public async updateMany(
        @Body(UpdateCardExpensesPipe) body: UpdateCardExpensesDto
    ): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.updateMany(body);
    }
}
