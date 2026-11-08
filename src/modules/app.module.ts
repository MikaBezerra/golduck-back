import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { CardExpensesModule } from './card-expenses/card-expenses.module.js';
import { CardImportsModule } from './card-imports/card-imports.module.js';
import { CardSyncModule } from './card-sync/card-sync.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CommonModule } from './common/index.js';
import { CreditCardsModule } from './credit-cards/credit-cards.module.js';
import { IncomesModule } from './incomes/incomes.module.js';
import { ManualExpensesModule } from './manual-expenses/manual-expenses.module.js';
import { PeopleModule } from './people/people.module.js';
import { ReservesModule } from './reserves/reserves.module.js';
import { SummaryModule } from './summary/summary.module.js';
import { SummaryDispatchModule } from './summary-dispatch/summary-dispatch.module.js';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        CardExpensesModule,
        CardImportsModule,
        CardSyncModule,
        CategoriesModule,
        CreditCardsModule,
        IncomesModule,
        ManualExpensesModule,
        PeopleModule,
        ReservesModule,
        SummaryModule,
        SummaryDispatchModule
    ]
})
export class ApplicationModule { }
