import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import {
    AnnualSummaryQueryDto,
    AnnualSummaryResponse,
    SummaryQueryDto,
    SummaryResponse,
    SummaryStatementResponse
} from '../dto/summary.dto.js';
import { AnnualSummaryQueryPipe, SummaryQueryPipe } from '../flow/summary.pipe.js';
import { SummaryService } from '../service/summary.service.js';

const RULES = 'Despesas do cartão entram pelo mês da fatura, sem as excluídas. '
    + 'A reserva do mês fica fora de expensesTotal, mas entra no saldo e na divisão como gasto compartilhado. '
    + 'Líquido individual = (entrada − compartilhadas − reserva) / pessoas ativas − despesas individuais.';

@ApiTags('summary')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('summary')
@Roles(Role.USER)
export class SummaryController {
    public constructor(private readonly summaryService: SummaryService) { }

    @Get()
    @ApiOperation({
        summary: 'Resumo do mês: entrada, despesas, saldo, compras do cartão por categoria, totais por pessoa e líquido individual',
        description: RULES
    })
    @ApiDataResponse(SummaryResponse)
    public async findByMonth(
        @Query(SummaryQueryPipe) query: SummaryQueryDto
    ): Promise<SummaryResponse> {
        return this.summaryService.findByMonth(query);
    }

    @Get('statement')
    @ApiOperation({
        summary: 'Resumo do mês em tabela: uma coluna por pessoa, linhas prontas e a quebra do líquido de cada pessoa',
        description: `${RULES} Em breakdown: beforeReserve − individual − reserve = net (a reserva entra uma vez só). `
            + 'reserve.accumulated soma todas as reservas até o mês, inclusive.'
    })
    @ApiDataResponse(SummaryStatementResponse)
    public async findStatement(
        @Query(SummaryQueryPipe) query: SummaryQueryDto
    ): Promise<SummaryStatementResponse> {
        return this.summaryService.findStatement(query);
    }

    @Get('annual')
    @ApiOperation({
        summary: 'Resumo do ano: os totais do mensal somados nos 12 meses, mais a lista dos meses',
        description: `${RULES} No anual, o líquido de cada pessoa é a soma dos líquidos mensais.`
    })
    @ApiDataResponse(AnnualSummaryResponse)
    public async findByYear(
        @Query(AnnualSummaryQueryPipe) query: AnnualSummaryQueryDto
    ): Promise<AnnualSummaryResponse> {
        return this.summaryService.findByYear(query);
    }
}
