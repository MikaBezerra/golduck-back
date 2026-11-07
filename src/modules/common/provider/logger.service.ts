import * as winston from 'winston';

const ANSI_RESET = '\u001b[0m';
const ANSI_DIM = '\u001b[2m';
const ANSI_CYAN = '\u001b[36m';
const ANSI_GREEN = '\u001b[32m';
const ANSI_YELLOW = '\u001b[33m';
const ANSI_RED = '\u001b[31m';

export class LoggerService {

    private readonly instance: winston.Logger;

    public constructor() {

        const format = this.isProductionEnv()
            ? winston.format.combine(winston.format.timestamp(), winston.format.json())
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(info => this.formatDevelopmentLog(info))
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

    private formatDevelopmentLog(info: winston.Logform.TransformableInfo): string {
        const time = new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(new Date(String(info.timestamp))).replace(',', '');
        const level = info.level.toUpperCase().padEnd(5);
        const levelColor = info.level === 'error' ? ANSI_RED : info.level === 'warn' ? ANSI_YELLOW : ANSI_GREEN;
        const prefix = `[API] ${process.pid} - ${time}  ${this.color(level, levelColor)}`;

        if (typeof info.method !== 'string' || typeof info.path !== 'string') {
            const errorDetails = typeof info.errorMessage === 'string'
                ? `\n    ↳ ${typeof info.errorName === 'string' ? info.errorName : 'Erro'}: ${info.errorMessage}`
                : '';
            const errorStack = typeof info.stack === 'string'
                ? `\n${info.stack.split('\n').slice(1).map(line => `      ${line.trim()}`).join('\n')}`
                : '';

            return `${prefix} ${String(info.message)}${errorDetails}${errorStack}`;
        }

        const statusCode = typeof info.statusCode === 'number' ? info.statusCode : 0;
        const durationMs = typeof info.durationMs === 'number' ? info.durationMs : 0;
        const statusColor = statusCode >= 500 ? ANSI_RED : statusCode >= 400 ? ANSI_YELLOW : ANSI_GREEN;
        const requestId = typeof info.requestId === 'string' ? info.requestId : '-';
        const userId = typeof info.userId === 'string' ? `  usuário=${info.userId}` : '';
        const summary = `${prefix}  ${this.color(info.method.padEnd(6), ANSI_CYAN)} ${info.path}`
            + `  ${this.color(String(statusCode), statusColor)} +${durationMs}ms  ${this.color(`[${requestId}]`, ANSI_DIM)}${userId}`;
        const reason = typeof info.reason === 'string' ? ` · ${info.reason}` : '';
        const code = typeof info.code === 'string' ? `\n    ↳ ${this.color(info.code, statusColor)}${reason}` : '';
        const errorName = typeof info.errorName === 'string' ? info.errorName : 'Erro';
        const error = typeof info.errorMessage === 'string'
            ? `\n    ↳ ${errorName}: ${info.errorMessage}`
            : '';
        const stack = typeof info.stack === 'string'
            ? `\n${info.stack.split('\n').slice(1).map(line => `      ${line.trim()}`).join('\n')}`
            : '';

        return `${summary}${code}${error}${stack}`;
    }

    private color(value: string, ansiCode: string): string {
        const forced = process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0';
        if (process.env.NO_COLOR !== undefined || (!process.stdout.isTTY && !process.stderr.isTTY && !forced)) {
            return value;
        }

        return `${ansiCode}${value}${ANSI_RESET}`;
    }

    private isTestEnv(): boolean {
        return process.env.NODE_ENV === 'test';
    }

    private isProductionEnv(): boolean {
        return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    }

}
