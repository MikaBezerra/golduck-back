import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common';
import { PeopleModule } from './people/people.module';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        PeopleModule
    ]
})
export class ApplicationModule { }
