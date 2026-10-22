import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './controller';
import { LogInterceptor } from './flow';
import { ApiExceptionFilter } from './http/api-exception.filter';
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
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
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
