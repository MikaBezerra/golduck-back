import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CommonModule } from './common';
import { PeopleModule } from './people/people.module';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        CategoriesModule,
        PeopleModule
    ]
})
export class ApplicationModule { }
