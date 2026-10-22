import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { ApplicationModule } from './modules/app.module';
import { CommonModule, LoggerService } from './modules/common';
import { RequestLogContext } from './modules/common/logging/request-log.context';
import { registerRequestLogging } from './modules/common/logging/request-logging';

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

    app.setGlobalPrefix(process.env.API_PREFIX || API_DEFAULT_PREFIX);

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
