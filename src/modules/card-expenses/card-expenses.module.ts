import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { CommonModule } from '../common';
import { PeopleModule } from '../people/people.module';
import { CardExpenseController } from './controller/card-expense.controller';
import { CardExpenseRepository } from './repository/card-expense.repository';
import { CardExpenseService } from './service/card-expense.service';

@Module({
    imports: [CommonModule, CategoriesModule, PeopleModule],
    controllers: [CardExpenseController],
    providers: [CardExpenseRepository, CardExpenseService]
})
export class CardExpensesModule { }
