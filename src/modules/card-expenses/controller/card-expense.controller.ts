import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import { CardExpenseResponse, CardExpenseScopeDto, ListCardExpensesDto, UpdateCardExpensesDto } from '../dto/card-expense.dto.js';
import { CardExpenseIdPipe, CardExpenseScopePipe, ListCardExpensesPipe, UpdateCardExpensesPipe } from '../flow/card-expense.pipe.js';
import { CardExpenseService } from '../service/card-expense.service.js';

/**
 * Despesas do cartão são criadas e removidas pelos uploads de fatura. Aqui o usuário
 * personaliza, exclui (exclusão suave, mantida pelos próximos uploads) e restaura.
 */
@ApiTags('card-expenses')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('card-expenses')
@Roles(Role.USER)
export class CardExpenseController {
    public constructor(private readonly cardExpenseService: CardExpenseService) { }

    @Get()
    @ApiOperation({ summary: 'Lista as despesas do cartão em um mês de fatura (sem as excluídas, salvo includeExcluded=true)' })
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

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Exclui despesas do cartão (exclusão suave)',
        description: 'As linhas saem das listas e dos totais, e os próximos uploads as mantêm excluídas. Em compras parceladas, scope define quais parcelas.'
    })
    @ApiNoContentResponse({ description: 'Despesas excluídas' })
    public async exclude(
        @Body(CardExpenseScopePipe) body: CardExpenseScopeDto
    ): Promise<void> {
        await this.cardExpenseService.exclude(body);
    }

    @Post('restore')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Restaura despesas excluídas', description: 'Devolve as linhas restauradas.' })
    @ApiDataResponse(CardExpenseResponse, { isArray: true })
    public async restore(
        @Body(CardExpenseScopePipe) body: CardExpenseScopeDto
    ): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.restore(body);
    }
}
