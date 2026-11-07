import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses, MONTH_PATTERN } from '../../common/swagger/api-docs';
import {
    CreateIncomeDto,
    IncomeResponse,
    ListIncomeDto,
    UpdateIncomeDto
} from '../dto/income.dto';
import {
    CreateIncomePipe,
    IncomeMonthPipe,
    ListIncomePipe,
    UpdateIncomePipe
} from '../flow/income.pipe';
import { IncomeService } from '../service/income.service';

@ApiTags('incomes')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('incomes')
@Roles(Role.USER)
export class IncomeController {
    public constructor(private readonly incomeService: IncomeService) { }

    @Post()
    @ApiOperation({ summary: 'Cadastra o mesmo valor de entrada em um ou mais meses do ano' })
    @ApiDataResponse(IncomeResponse, { status: HttpStatus.CREATED, isArray: true })
    public async create(
        @Body(CreateIncomePipe) body: CreateIncomeDto
    ): Promise<IncomeResponse[]> {
        return this.incomeService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Lista as entradas, opcionalmente de um ano' })
    @ApiDataResponse(IncomeResponse, { isArray: true })
    public async findAll(
        @Query(ListIncomePipe) query: ListIncomeDto
    ): Promise<IncomeResponse[]> {
        return this.incomeService.findAll(query);
    }

    @Get(':month')
    @ApiOperation({ summary: 'Consulta a entrada de um mês' })
    @ApiParam({ name: 'month', schema: { type: 'string', pattern: MONTH_PATTERN, example: '2026-08' } })
    @ApiDataResponse(IncomeResponse)
    public async findByMonth(
        @Param('month', IncomeMonthPipe) month: string
    ): Promise<IncomeResponse> {
        return this.incomeService.findByMonth(month);
    }

    @Patch(':month')
    @ApiOperation({ summary: 'Altera o valor da entrada de um mês' })
    @ApiParam({ name: 'month', schema: { type: 'string', pattern: MONTH_PATTERN, example: '2026-08' } })
    @ApiDataResponse(IncomeResponse)
    public async update(
        @Param('month', IncomeMonthPipe) month: string,
        @Body(UpdateIncomePipe) body: UpdateIncomeDto
    ): Promise<IncomeResponse> {
        return this.incomeService.update(month, body);
    }

    @Delete(':month')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Remove a entrada de um mês' })
    @ApiParam({ name: 'month', schema: { type: 'string', pattern: MONTH_PATTERN, example: '2026-08' } })
    @ApiNoContentResponse({ description: 'Entrada removida' })
    public async delete(
        @Param('month', IncomeMonthPipe) month: string
    ): Promise<void> {
        await this.incomeService.delete(month);
    }
}
