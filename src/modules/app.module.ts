import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CardExpensesModule } from './card-expenses/card-expenses.module';
import { CardImportsModule } from './card-imports/card-imports.module';
import { CategoriesModule } from './categories/categories.module';
import { CommonModule } from './common';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { IncomesModule } from './incomes/incomes.module';
import { ManualExpensesModule } from './manual-expenses/manual-expenses.module';
import { PeopleModule } from './people/people.module';
import { ReservesModule } from './reserves/reserves.module';
import { SummaryModule } from './summary/summary.module';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        CardExpensesModule,
        CardImportsModule,
        CategoriesModule,
        CreditCardsModule,
        IncomesModule,
        ManualExpensesModule,
        PeopleModule,
        ReservesModule,
        SummaryModule
    ]
})
export class ApplicationModule { }
