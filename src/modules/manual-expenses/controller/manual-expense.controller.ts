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

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import {
    CreateManualExpenseDto,
    DeleteManualExpensesDto,
    ListManualExpensesDto,
    ManualExpenseResponse,
    ManualExpensesSummaryResponse,
    UpdateManualExpensesDto
} from '../dto/manual-expense.dto.js';
import {
    CreateManualExpensePipe,
    DeleteManualExpensesPipe,
    ListManualExpensesPipe,
    ManualExpenseIdPipe,
    UpdateManualExpensesPipe
} from '../flow/manual-expense.pipe.js';
import { ManualExpenseService } from '../service/manual-expense.service.js';

@ApiTags('manual-expenses')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('manual-expenses')
@Roles(Role.USER)
export class ManualExpenseController {
    public constructor(private readonly manualExpenseService: ManualExpenseService) { }

    @Post()
    @ApiOperation({ summary: 'Cria uma despesa fora do cartão (ou uma por mês até dezembro)' })
    @ApiDataResponse(ManualExpenseResponse, { status: HttpStatus.CREATED, isArray: true })
    public async create(
        @Body(CreateManualExpensePipe) body: CreateManualExpenseDto
    ): Promise<ManualExpenseResponse[]> {
        return this.manualExpenseService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Lista as despesas do mês' })
    @ApiDataResponse(ManualExpenseResponse, { isArray: true })
    public async findAll(
        @Query(ListManualExpensesPipe) query: ListManualExpensesDto
    ): Promise<ManualExpenseResponse[]> {
        return this.manualExpenseService.findAll(query);
    }

    @Get('summary')
    @ApiOperation({ summary: 'Resumo das despesas do mês: total, pago e a pagar' })
    @ApiDataResponse(ManualExpensesSummaryResponse)
    public async summarize(
        @Query(ListManualExpensesPipe) query: ListManualExpensesDto
    ): Promise<ManualExpensesSummaryResponse> {
        return this.manualExpenseService.summarize(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Consulta uma despesa' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(ManualExpenseResponse)
    public async findById(
        @Param('id', ManualExpenseIdPipe) id: string
    ): Promise<ManualExpenseResponse> {
        return this.manualExpenseService.findById(id);
    }

    @Patch()
    @ApiOperation({ summary: 'Altera as despesas dos IDs enviados, em uma transação' })
    @ApiDataResponse(ManualExpenseResponse, { isArray: true })
    public async updateMany(
        @Body(UpdateManualExpensesPipe) body: UpdateManualExpensesDto
    ): Promise<ManualExpenseResponse[]> {
        return this.manualExpenseService.updateMany(body);
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Exclui as despesas dos IDs enviados, em uma transação' })
    @ApiNoContentResponse({ description: 'Despesas excluídas' })
    public async deleteMany(
        @Body(DeleteManualExpensesPipe) body: DeleteManualExpensesDto
    ): Promise<void> {
        await this.manualExpenseService.deleteMany(body.ids);
    }
}
