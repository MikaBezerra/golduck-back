import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

import { getAppInfo } from '../logging/app-info';
import { readLogSettings } from '../logging/log-settings';
import { formatPretty } from '../logging/pretty-format';

/**
 * Logger da API (winston), configurado pelas variáveis LOG_*.
 *
 * - formato json: uma linha por evento, já com service, version, commit e env (ambientes publicados);
 * - formato pretty: resumo legível e colorido (desenvolvimento local);
 * - erros vão para o stderr, o resto para o stdout.
 */
@Injectable()
export class LoggerService {

    private readonly instance: winston.Logger;

    public constructor() {
        const settings = readLogSettings();
        const app = getAppInfo();
        const json = settings.format === 'json';

        this.instance = winston.createLogger({
            level: settings.level,
            silent: settings.silent,
            defaultMeta: json
                ? { service: app.name, version: app.version, commit: app.commit, env: app.environment }
                : undefined,
            format: json
                ? winston.format.combine(winston.format.timestamp(), winston.format.json())
                : winston.format.combine(winston.format.timestamp(), winston.format.printf(formatPretty)),
            transports: [
                new winston.transports.Console({
                    stderrLevels: ['error']
                })
            ]
        });
    }

    public debug(message: string, metadata: Record<string, unknown> = {}): void {
        this.instance.debug(message, metadata);
    }

    public info(message: string, metadata: Record<string, unknown> = {}): void {
        this.instance.info(message, metadata);
    }

    public warn(message: string, metadata: Record<string, unknown> = {}): void {
        this.instance.warn(message, metadata);
    }

    public error(message: string, metadata: Record<string, unknown> = {}): void {
        this.instance.error(message, metadata);
    }

}
