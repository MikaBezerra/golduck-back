import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import { SummaryQueryDto, SummaryResponse } from '../dto/summary.dto';
import { SummaryQueryPipe } from '../flow/summary.pipe';
import { SummaryService } from '../service/summary.service';

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
        description: 'Despesas do cartão entram pelo mês da fatura, sem as excluídas. '
            + 'Líquido individual = (entrada − compartilhadas) / pessoas ativas − despesas individuais.'
    })
    @ApiDataResponse(SummaryResponse)
    public async findByMonth(
        @Query(SummaryQueryPipe) query: SummaryQueryDto
    ): Promise<SummaryResponse> {
        return this.summaryService.findByMonth(query);
    }
}
