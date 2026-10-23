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
    CreateManualExpenseDto,
    DeleteManualExpensesDto,
    ListManualExpensesDto,
    ManualExpenseResponse,
    UpdateManualExpensesDto
} from '../dto/manual-expense.dto';
import {
    CreateManualExpensePipe,
    DeleteManualExpensesPipe,
    ListManualExpensesPipe,
    ManualExpenseIdPipe,
    UpdateManualExpensesPipe
} from '../flow/manual-expense.pipe';
import { ManualExpenseService } from '../service/manual-expense.service';

@Controller('manual-expenses')
@Roles(Role.USER)
export class ManualExpenseController {
    public constructor(private readonly manualExpenseService: ManualExpenseService) { }

    @Post()
    public async create(
        @Body(CreateManualExpensePipe) body: CreateManualExpenseDto
    ): Promise<ManualExpenseResponse[]> {
        return this.manualExpenseService.create(body);
    }

    @Get()
    public async findAll(
        @Query(ListManualExpensesPipe) query: ListManualExpensesDto
    ): Promise<ManualExpenseResponse[]> {
        return this.manualExpenseService.findAll(query);
    }

    @Get(':id')
    public async findById(
        @Param('id', ManualExpenseIdPipe) id: string
    ): Promise<ManualExpenseResponse> {
        return this.manualExpenseService.findById(id);
    }

    @Patch()
    public async updateMany(
        @Body(UpdateManualExpensesPipe) body: UpdateManualExpensesDto
    ): Promise<ManualExpenseResponse[]> {
        return this.manualExpenseService.updateMany(body);
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    public async deleteMany(
        @Body(DeleteManualExpensesPipe) body: DeleteManualExpensesDto
    ): Promise<void> {
        await this.manualExpenseService.deleteMany(body.ids);
    }
}
