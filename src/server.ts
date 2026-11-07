import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { ApplicationModule } from './modules/app.module';
import { MAX_STATEMENT_FILE_BYTES } from './modules/card-imports/flow/multipart-upload';
import { CommonModule, Config, LoggerService } from './modules/common';
import { RequestLogContext } from './modules/common/logging/request-log.context';
import { registerRequestLogging } from './modules/common/logging/request-logging';
import { setupSwagger } from './modules/common/swagger/swagger.setup';
import { Service } from './modules/tokens';

/**
 * These are API defaults that can be changed using environment variables,
 * it is not required to change them (see the `.env.example` file)
 */
const API_DEFAULT_PORT = 3000;
const API_DEFAULT_PREFIX = '/api';

/**
 * Build & bootstrap the NestJS API.
 * This method is the starting point of the API; it registers the application
 * module and registers essential components such as the logger and request
 * parsing middleware.
 */
async function bootstrap(): Promise<void> {

    const app = await NestFactory.create<NestFastifyApplication>(
        ApplicationModule,
        new FastifyAdapter()
    );

    // @todo Enable Helmet for better API security headers

    // Uploads de faturas; os limites de cada rota são definidos ao ler o formulário.
    await app.register(fastifyMultipart, {
        limits: { files: 1, fileSize: MAX_STATEMENT_FILE_BYTES }
    });

    const config = app.get<Config>(Service.CONFIG);

    // CORS só é ligado quando API_CORS_ORIGINS tem origens (em desenvolvimento o front usa proxy).
    const corsOrigins = config.API_CORS_ORIGINS ?? [];

    if (corsOrigins.length > 0) {
        app.enableCors({
            origin: corsOrigins,
            // O padrão do @fastify/cors libera só GET, HEAD e POST.
            methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
            exposedHeaders: ['x-request-id']
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

    await app.listen(process.env.API_PORT || API_DEFAULT_PORT);
}

/**
 * It is now time to turn the lights on!
 * Any major error that can not be handled by NestJS will be caught in the code
 * below. The default behavior is to display the error on stdout and quit.
 *
 * @todo It is often advised to enhance the code below with an exception-catching
 *       service for better error handling in production environments.
 */
bootstrap().catch(err => {

    // eslint-disable-next-line no-console
    console.error(err);

    const defaultExitCode = 1;
    process.exit(defaultExitCode);
});
