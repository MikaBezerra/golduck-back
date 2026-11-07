import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { AnnualSummaryQueryDto, AnnualSummaryResponse, SummaryQueryDto, SummaryResponse } from '../dto/summary.dto';
import { AnnualSummaryQueryPipe, SummaryQueryPipe } from '../flow/summary.pipe';
import { SummaryService } from '../service/summary.service';

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
        summary: 'Resumo do mês: entrada, despesas, saldo, totais por categoria e por pessoa e líquido individual',
        description: RULES
    })
    @ApiDataResponse(SummaryResponse)
    public async findByMonth(
        @Query(SummaryQueryPipe) query: SummaryQueryDto
    ): Promise<SummaryResponse> {
        return this.summaryService.findByMonth(query);
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
