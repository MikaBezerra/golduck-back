import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { CommonModule } from '../common';
import { PeopleModule } from '../people/people.module';
import { ManualExpenseController } from './controller/manual-expense.controller';
import { ManualExpenseRepository } from './repository/manual-expense.repository';
import { ManualExpenseService } from './service/manual-expense.service';

@Module({
    imports: [CommonModule, CategoriesModule, PeopleModule],
    controllers: [ManualExpenseController],
    providers: [ManualExpenseRepository, ManualExpenseService]
})
export class ManualExpensesModule { }
