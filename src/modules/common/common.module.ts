import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController, VersionController } from './controller/index.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { ApiResponseInterceptor } from './http/api-response.interceptor.js';
import { RequestLogContext } from './logging/request-log.context.js';
import { configProvider, LoggerService, PrismaService } from './provider/index.js';
import { RateLimitStore } from './security/rate-limit.decorator.js';

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
