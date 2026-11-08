import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import {
    CardExpenseResponse,
    CardExpenseScopeDto,
    CreateCardExpenseDto,
    ListCardExpensesDto,
    MoveCardExpenseDto,
    UpdateCardExpensesDto
} from '../dto/card-expense.dto.js';
import {
    CardExpenseIdPipe,
    CardExpenseScopePipe,
    CreateCardExpensePipe,
    ListCardExpensesPipe,
    MoveCardExpensePipe,
    UpdateCardExpensesPipe
} from '../flow/card-expense.pipe.js';
import { CardExpenseService } from '../service/card-expense.service.js';

/**
 * Despesas do cartão vêm da sincronização com o Meu Pluggy, de uploads de fatura ou de "Adicionar compra". Aqui o usuário
 * lança compras, muda a compra de fatura, personaliza, exclui (exclusão suave, mantida pelas próximas
 * sincronizações e uploads) e restaura.
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

    @Post()
    @ApiOperation({
        summary: 'Adicionar compra: lança uma compra que está faltando na fatura',
        description: 'Parcelada, lança também as parcelas seguintes. A sincronização não apaga estas linhas; quando o banco '
            + 'trouxer a mesma compra (mesmo valor, até 3 dias de diferença), ela substitui a lançada à mão e herda apelido, '
            + 'categoria e pessoa. Devolve as linhas criadas.'
    })
    @ApiDataResponse(CardExpenseResponse, { isArray: true, status: HttpStatus.CREATED })
    public async create(@Body(CreateCardExpensePipe) body: CreateCardExpenseDto): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.create(body);
    }

    @Post(':id/move')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Muda a compra de fatura (e, se quiser, de parcela)',
        description: 'Esta linha passa a ser a parcela informada no mês informado e as outras seguem a partir dela: a compra '
            + 'inteira muda e os meses que ficaram sem ela deixam de tê-la. Em compras sincronizadas, a sincronização passa a '
            + 'respeitar a correção. Compras de upload não mudam (409 CARD_EXPENSE_MOVE_NOT_ALLOWED). Devolve as linhas da compra.'
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CardExpenseResponse, { isArray: true })
    public async move(
        @Param('id', CardExpenseIdPipe) id: string,
        @Body(MoveCardExpensePipe) body: MoveCardExpenseDto
    ): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.move(id, body);
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
