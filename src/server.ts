import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { configureApp } from './app.setup';
import { ApplicationModule } from './modules/app.module';
import { describeError, getAppInfo, LoggerService, readLogSettings } from './modules/common';
import { NestLoggerAdapter } from './modules/common/logging/nest-logger.adapter';
import { registerProcessErrorLogging } from './modules/common/logging/process-logging';
import { generateRequestId } from './modules/common/logging/request-id';
import { fastifyTrustProxy } from './modules/common/provider/trust-proxy';

/** Usado quando API_PORT não vem do ambiente (veja o .env.example). */
const API_DEFAULT_PORT = 3000;

/** Logger da subida: existe antes do Nest, para registrar inclusive uma configuração inválida. */
const logger = new LoggerService();

/**
 * Cria a API, aplica a configuração comum (app.setup.ts) e começa a ouvir a porta.
 * A configuração é validada pelo provider de Config ao criar o módulo; se faltar algo, a API nem sobe.
 */
async function bootstrap(): Promise<void> {

    registerProcessErrorLogging(logger);

    const app = await NestFactory.create<NestFastifyApplication>(
        ApplicationModule,
        new FastifyAdapter({
            trustProxy: fastifyTrustProxy(process.env.TRUST_PROXY),
            genReqId: generateRequestId
        }),
        {
            logger: new NestLoggerAdapter(logger),
            // Sem isto o Nest aborta o processo num erro de inicialização, antes de o catch abaixo registrar.
            abortOnError: false
        }
    );

    const { config, prefix, corsOrigins } = await configureApp(app);

    // Em SIGTERM/SIGINT o Nest encerra os módulos (ex.: fecha as conexões do Prisma) antes de sair.
    app.enableShutdownHooks();

    const port = process.env.API_PORT || API_DEFAULT_PORT;
    await app.listen(port);

    const appInfo = getAppInfo();
    const logSettings = readLogSettings();

    // Mesmos nomes de campo do restante dos logs (no formato json, env/version/commit já vêm em toda linha).
    logger.info('API no ar', {
        port: Number(port),
        prefix,
        env: appInfo.environment,
        version: appInfo.version,
        commit: appInfo.commit ?? undefined,
        node: process.version,
        swagger: config.SWAGGER_ENABLE === '1' ? '/docs' : 'desligado',
        cors: corsOrigins.length > 0 ? corsOrigins : 'desligado',
        log: `${logSettings.level}/${logSettings.format}`
    });
}

/**
 * Qualquer erro na subida (configuração inválida, banco fora do ar, porta ocupada...)
 * é registrado no log e encerra o processo com código 1.
 */
bootstrap().catch((error: unknown) => {
    logger.error('Falha ao iniciar a API', describeError(error));
    process.exit(1);
});
