import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { CardExpenseResponse, ListCardExpensesDto, UpdateCardExpensesDto } from '../dto/card-expense.dto';
import { CardExpenseIdPipe, ListCardExpensesPipe, UpdateCardExpensesPipe } from '../flow/card-expense.pipe';
import { CardExpenseService } from '../service/card-expense.service';

/** Despesas do cartão são criadas e removidas somente pelos uploads de fatura. */
@Controller('card-expenses')
@Roles(Role.USER)
export class CardExpenseController {
    public constructor(private readonly cardExpenseService: CardExpenseService) { }

    @Get()
    public async findAll(
        @Query(ListCardExpensesPipe) query: ListCardExpensesDto
    ): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.findAll(query);
    }

    @Get(':id')
    public async findById(@Param('id', CardExpenseIdPipe) id: string): Promise<CardExpenseResponse> {
        return this.cardExpenseService.findById(id);
    }

    @Patch()
    public async updateMany(
        @Body(UpdateCardExpensesPipe) body: UpdateCardExpensesDto
    ): Promise<CardExpenseResponse[]> {
        return this.cardExpenseService.updateMany(body);
    }
}
