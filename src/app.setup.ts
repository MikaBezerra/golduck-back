import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Server } from 'node:http';

import { MAX_STATEMENT_FILE_BYTES } from './modules/card-imports/flow/multipart-upload.js';
import { CommonModule, Config, LoggerService } from './modules/common/index.js';
import { APP_VERSION_HEADER, REQUEST_ID_HEADER } from './modules/common/logging/request-id.js';
import { RequestLogContext } from './modules/common/logging/request-log.context.js';
import { registerRequestLogging } from './modules/common/logging/request-logging.js';
import { setupSwagger } from './modules/common/swagger/swagger.setup.js';
import { Service } from './modules/tokens.js';

/** Usado quando API_PREFIX não vem do ambiente (veja o .env.example). */
const API_DEFAULT_PREFIX = '/api';

export interface ConfiguredApp {
    readonly config: Config;
    readonly prefix: string;
    readonly corsOrigins: readonly string[];
}

/**
 * Plugins do Fastify, CORS, prefixo, documentação e logs de requisição.
 * Usado pelo server.ts e pelos testes HTTP, para os dois montarem a API do mesmo jeito.
 */
export async function configureApp(app: NestFastifyApplication): Promise<ConfiguredApp> {
    const config = app.get<Config>(Service.CONFIG);

    // Headers de segurança. A CSP só fica desligada com o Swagger ligado, porque a interface do /docs usa scripts inline.
    await app.register(fastifyHelmet, {
        contentSecurityPolicy: config.SWAGGER_ENABLE === '1' ? false : undefined
    });

    // Lê os cookies da requisição (refresh token) e permite gravá-los na resposta.
    await app.register(fastifyCookie);

    // Uploads de faturas; os limites de cada rota são definidos ao ler o formulário.
    await app.register(fastifyMultipart, {
        limits: { files: 1, fileSize: MAX_STATEMENT_FILE_BYTES }
    });

    allowEmptyJsonBody(app);

    // CORS só é ligado quando API_CORS_ORIGINS tem origens (em desenvolvimento o front usa proxy).
    const corsOrigins = config.API_CORS_ORIGINS ?? [];

    if (corsOrigins.length > 0) {
        app.enableCors({
            origin: corsOrigins,
            // Permite o envio do cookie de sessão; por isso as origens são sempre explícitas (nunca "*").
            credentials: true,
            // O padrão do @fastify/cors libera só GET, HEAD e POST.
            methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
            allowedHeaders: ['Authorization', 'Content-Type', REQUEST_ID_HEADER],
            // O front lê esses headers: id para suporte, versão da API e espera após um 429.
            exposedHeaders: [REQUEST_ID_HEADER, APP_VERSION_HEADER, 'retry-after']
        });
    }

    const prefix = config.API_PREFIX || API_DEFAULT_PREFIX;
    app.setGlobalPrefix(prefix);

    // Documentação OpenAPI em /docs e /docs-json, fora do prefixo da API.
    if (config.SWAGGER_ENABLE === '1') {
        setupSwagger(app, config);
    }

    const common = app.select(CommonModule);
    registerRequestLogging(
        app.getHttpAdapter().getInstance(),
        common.get(LoggerService),
        common.get(RequestLogContext)
    );

    return { config, prefix, corsOrigins };
}

/**
 * Aceita "Content-Type: application/json" com corpo vazio (ex.: POST /auth/refresh sem corpo).
 * Por padrão o Fastify responde 400 nesse caso; o resto continua no parser padrão, que barra
 * __proto__ e constructor no JSON.
 */
function allowEmptyJsonBody(app: NestFastifyApplication): void {
    const fastify = app.getHttpAdapter().getInstance();
    const defaultJsonParser = fastify.getDefaultJsonParser('error', 'error');

    app.useBodyParser<Server>('application/json', { bodyLimit: fastify.initialConfig.bodyLimit }, (request, body, done) => {
        if (body.length === 0) {
            done(null, undefined);
            return;
        }

        // O parser padrão responde pelo callback (done); o retorno não importa.
        void defaultJsonParser(request, body.toString('utf8'), done);
    });
}
