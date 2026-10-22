import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common';
import { PassengerModule } from './passenger/passenger.module';

@Module({
    imports: [
        CommonModule,
        PassengerModule,
        AuthModule
    ]
})
export class ApplicationModule { }
