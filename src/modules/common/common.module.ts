import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './controller';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { ApiResponseInterceptor } from './http/api-response.interceptor';
import { RequestLogContext } from './logging/request-log.context';
import { configProvider, LoggerService, PrismaService } from './provider';

@Module({
    imports: [
        TerminusModule,
        // Só registra o contador; o limite vale nas rotas marcadas com @RateLimit().
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }] })
    ],
    providers: [
        configProvider,
        LoggerService,
        RequestLogContext,
        PrismaService,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor }
    ],
    exports: [
        configProvider,
        LoggerService,
        RequestLogContext,
        PrismaService
    ],
    controllers: [
        HealthController
    ],
})
export class CommonModule {}
