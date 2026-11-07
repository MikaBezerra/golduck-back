import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController, VersionController } from './controller';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { ApiResponseInterceptor } from './http/api-response.interceptor';
import { RequestLogContext } from './logging/request-log.context';
import { configProvider, LoggerService, PrismaService } from './provider';
import { RateLimitStore } from './security/rate-limit.decorator';

@Module({
    imports: [
        TerminusModule
    ],
    providers: [
        configProvider,
        LoggerService,
        RequestLogContext,
        PrismaService,
        // Contadores do @RateLimit(), compartilhados por todos os módulos.
        RateLimitStore,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor }
    ],
    exports: [
        configProvider,
        LoggerService,
        RequestLogContext,
        PrismaService,
        RateLimitStore
    ],
    controllers: [
        HealthController,
        VersionController
    ],
})
export class CommonModule {}
