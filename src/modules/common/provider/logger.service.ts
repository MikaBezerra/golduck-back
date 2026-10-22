import * as winston from 'winston';

export class LoggerService {

    private readonly instance: winston.Logger;

    public constructor() {

        const format = this.isProductionEnv()
            ? winston.format.combine(winston.format.timestamp(), winston.format.json())
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message, ...metadata }) => {
                    const fields = Object.entries(metadata)
                        .filter(([, value]) => value !== undefined)
                        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                        .join(' ');

                    return `${String(timestamp)} ${level.toUpperCase()} ${String(message)}${fields ? ` ${fields}` : ''}`;
                })
            );

        this.instance = winston.createLogger({
            level: 'info',
            silent: this.isTestEnv(),
            format,
            transports: [
                new winston.transports.Console({
                    stderrLevels: ['error']
                })
            ]
        });
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

    private isTestEnv(): boolean {
        return process.env.NODE_ENV === 'test';
    }

    private isProductionEnv(): boolean {
        return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    }

}
