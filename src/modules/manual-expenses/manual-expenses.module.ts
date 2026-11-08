import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { PeopleModule } from '../people/people.module.js';
import { ManualExpenseController } from './controller/manual-expense.controller.js';
import { ManualExpenseRepository } from './repository/manual-expense.repository.js';
import { ManualExpenseService } from './service/manual-expense.service.js';

@Module({
    imports: [CommonModule, PeopleModule],
    controllers: [ManualExpenseController],
    providers: [ManualExpenseRepository, ManualExpenseService]
})
export class ManualExpensesModule { }
