import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { ApplicationModule } from './modules/app.module';
import { MAX_STATEMENT_FILE_BYTES } from './modules/card-imports/flow/multipart-upload';
import { CommonModule, Config, LoggerService } from './modules/common';
import { RequestLogContext } from './modules/common/logging/request-log.context';
import { registerRequestLogging } from './modules/common/logging/request-logging';
import { fastifyTrustProxy } from './modules/common/provider/trust-proxy';
import { setupSwagger } from './modules/common/swagger/swagger.setup';
import { Service } from './modules/tokens';

/** Valores usados quando API_PORT e API_PREFIX não vêm do ambiente (veja o .env.example). */
const API_DEFAULT_PORT = 3000;
const API_DEFAULT_PREFIX = '/api';

/**
 * Monta e sobe a API: plugins do Fastify, CORS, prefixo, documentação e logs de requisição.
 * A configuração é validada pelo provider de Config ao criar o módulo; se faltar algo, a API nem sobe.
 */
async function bootstrap(): Promise<void> {

    const app = await NestFactory.create<NestFastifyApplication>(
        ApplicationModule,
        new FastifyAdapter({ trustProxy: fastifyTrustProxy(process.env.TRUST_PROXY) })
    );

    const config = app.get<Config>(Service.CONFIG);

    // Headers de segurança. A CSP só fica desligada com o Swagger ligado, porque a interface do /docs usa scripts inline.
    await app.register(fastifyHelmet, {
        contentSecurityPolicy: config.SWAGGER_ENABLE === '1' ? false : undefined
    });

    // Uploads de faturas; os limites de cada rota são definidos ao ler o formulário.
    await app.register(fastifyMultipart, {
        limits: { files: 1, fileSize: MAX_STATEMENT_FILE_BYTES }
    });

    // CORS só é ligado quando API_CORS_ORIGINS tem origens (em desenvolvimento o front usa proxy).
    const corsOrigins = config.API_CORS_ORIGINS ?? [];

    if (corsOrigins.length > 0) {
        app.enableCors({
            origin: corsOrigins,
            // O padrão do @fastify/cors libera só GET, HEAD e POST.
            methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
            exposedHeaders: ['x-request-id', 'retry-after']
        });
    }

    app.setGlobalPrefix(process.env.API_PREFIX || API_DEFAULT_PREFIX);

    // Documentação OpenAPI em /docs e /docs-json, fora do prefixo da API.
    if (config.SWAGGER_ENABLE === '1') {
        setupSwagger(app);
    }

    const common = app.select(CommonModule);
    registerRequestLogging(
        app.getHttpAdapter().getInstance(),
        common.get(LoggerService),
        common.get(RequestLogContext)
    );

    // Em SIGTERM/SIGINT o Nest encerra os módulos (ex.: fecha as conexões do Prisma) antes de sair.
    app.enableShutdownHooks();

    await app.listen(process.env.API_PORT || API_DEFAULT_PORT);
}

/**
 * Qualquer erro na subida (configuração inválida, banco fora do ar, porta ocupada...)
 * é registrado no log e encerra o processo com código 1.
 */
bootstrap().catch((error: unknown) => {
    new LoggerService().error('Falha ao iniciar a API', {
        errorName: error instanceof Error ? error.name : 'Erro',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });

    process.exit(1);
});
