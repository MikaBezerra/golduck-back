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

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
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

@Controller('incomes')
@Roles(Role.USER)
export class IncomeController {
    public constructor(private readonly incomeService: IncomeService) { }

    @Post()
    public async create(
        @Body(CreateIncomePipe) body: CreateIncomeDto
    ): Promise<IncomeResponse[]> {
        return this.incomeService.create(body);
    }

    @Get()
    public async findAll(
        @Query(ListIncomePipe) query: ListIncomeDto
    ): Promise<IncomeResponse[]> {
        return this.incomeService.findAll(query);
    }

    @Get(':month')
    public async findByMonth(
        @Param('month', IncomeMonthPipe) month: string
    ): Promise<IncomeResponse> {
        return this.incomeService.findByMonth(month);
    }

    @Patch(':month')
    public async update(
        @Param('month', IncomeMonthPipe) month: string,
        @Body(UpdateIncomePipe) body: UpdateIncomeDto
    ): Promise<IncomeResponse> {
        return this.incomeService.update(month, body);
    }

    @Delete(':month')
    @HttpCode(HttpStatus.NO_CONTENT)
    public async delete(
        @Param('month', IncomeMonthPipe) month: string
    ): Promise<void> {
        await this.incomeService.delete(month);
    }
}
