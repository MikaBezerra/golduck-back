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
import { ApiDataResponse, ApiErrorResponses, MONTH_PATTERN } from '../../common/swagger/api-docs.js';
import {
    CreateReserveDto,
    ListReserveDto,
    ReserveResponse,
    ReserveTotalsResponse,
    UpdateReserveDto
} from '../dto/reserve.dto.js';
import {
    CreateReservePipe,
    ListReservePipe,
    ReserveMonthPipe,
    UpdateReservePipe
} from '../flow/reserve.pipe.js';
import { ReserveService } from '../service/reserve.service.js';

@ApiTags('reserves')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('reserves')
@Roles(Role.USER)
export class ReserveController {
    public constructor(private readonly reserveService: ReserveService) { }

    @Post()
    @ApiOperation({ summary: 'Cadastra o mesmo valor de reserva em um ou mais meses do ano' })
    @ApiDataResponse(ReserveResponse, { status: HttpStatus.CREATED, isArray: true })
    public async create(
        @Body(CreateReservePipe) body: CreateReserveDto
    ): Promise<ReserveResponse[]> {
        return this.reserveService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Lista as reservas, opcionalmente de um ano' })
    @ApiDataResponse(ReserveResponse, { isArray: true })
    public async findAll(
        @Query(ListReservePipe) query: ListReserveDto
    ): Promise<ReserveResponse[]> {
        return this.reserveService.findAll(query);
    }

    @Get('totals')
    @ApiOperation({ summary: 'Soma histórica das reservas e a soma de cada ano' })
    @ApiDataResponse(ReserveTotalsResponse)
    public async totals(): Promise<ReserveTotalsResponse> {
        return this.reserveService.totals();
    }

    @Get(':month')
    @ApiOperation({ summary: 'Consulta a reserva de um mês' })
    @ApiParam({ name: 'month', schema: { type: 'string', pattern: MONTH_PATTERN, example: '2026-08' } })
    @ApiDataResponse(ReserveResponse)
    public async findByMonth(
        @Param('month', ReserveMonthPipe) month: string
    ): Promise<ReserveResponse> {
        return this.reserveService.findByMonth(month);
    }

    @Patch(':month')
    @ApiOperation({ summary: 'Altera o valor da reserva de um mês' })
    @ApiParam({ name: 'month', schema: { type: 'string', pattern: MONTH_PATTERN, example: '2026-08' } })
    @ApiDataResponse(ReserveResponse)
    public async update(
        @Param('month', ReserveMonthPipe) month: string,
        @Body(UpdateReservePipe) body: UpdateReserveDto
    ): Promise<ReserveResponse> {
        return this.reserveService.update(month, body);
    }

    @Delete(':month')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Remove a reserva de um mês' })
    @ApiParam({ name: 'month', schema: { type: 'string', pattern: MONTH_PATTERN, example: '2026-08' } })
    @ApiNoContentResponse({ description: 'Reserva removida' })
    public async delete(
        @Param('month', ReserveMonthPipe) month: string
    ): Promise<void> {
        await this.reserveService.delete(month);
    }
}
