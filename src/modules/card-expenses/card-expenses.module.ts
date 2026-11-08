import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { CommonModule } from '../common/index.js';
import { CreditCardsModule } from '../credit-cards/credit-cards.module.js';
import { PeopleModule } from '../people/people.module.js';
import { CardExpenseController } from './controller/card-expense.controller.js';
import { CardExpenseRepository } from './repository/card-expense.repository.js';
import { CardExpenseService } from './service/card-expense.service.js';

@Module({
    imports: [CommonModule, CategoriesModule, PeopleModule, CreditCardsModule],
    controllers: [CardExpenseController],
    providers: [CardExpenseRepository, CardExpenseService]
})
export class CardExpensesModule { }
