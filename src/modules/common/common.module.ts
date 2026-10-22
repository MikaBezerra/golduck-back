import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './controller';
import { LogInterceptor } from './flow';
import { ApiResponseInterceptor } from './http/api-response.interceptor';
import { configProvider, LoggerService, PrismaService } from './provider';

@Module({
    imports: [
        TerminusModule
    ],
    providers: [
        configProvider,
        LoggerService,
        LogInterceptor,
        PrismaService,
        { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor }
    ],
    exports: [
        configProvider,
        LoggerService,
        LogInterceptor,
        PrismaService
    ],
    controllers: [
        HealthController
    ],
})
export class CommonModule {}
