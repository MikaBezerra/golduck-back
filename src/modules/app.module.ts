import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CommonModule } from './common';
import { IncomesModule } from './incomes/incomes.module';
import { PeopleModule } from './people/people.module';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        CategoriesModule,
        IncomesModule,
        PeopleModule
    ]
})
export class ApplicationModule { }
