import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CommonModule } from './common';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { IncomesModule } from './incomes/incomes.module';
import { ManualExpensesModule } from './manual-expenses/manual-expenses.module';
import { PeopleModule } from './people/people.module';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        CategoriesModule,
        CreditCardsModule,
        IncomesModule,
        ManualExpensesModule,
        PeopleModule
    ]
})
export class ApplicationModule { }
