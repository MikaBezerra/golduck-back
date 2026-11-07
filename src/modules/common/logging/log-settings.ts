export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export const LOG_FORMATS = ['pretty', 'json'] as const;
export const LOG_REQUEST_BODY_MODES = ['off', 'errors', 'all'] as const;

export type LogLevel = typeof LOG_LEVELS[number];
export type LogFormat = typeof LOG_FORMATS[number];
export type LogRequestBodyMode = typeof LOG_REQUEST_BODY_MODES[number];

export interface LogSettings {
    /** Nível mínimo registrado. */
    readonly level: LogLevel;
    /** pretty: legível e colorido (local); json: uma linha por evento (ambientes publicados). */
    readonly format: LogFormat;
    /** Quando registrar o corpo de POST/PUT/PATCH/DELETE. */
    readonly requestBody: LogRequestBodyMode;
    /** A partir de quantos ms uma requisição é registrada como lenta. */
    readonly slowRequestMs: number;
    /** A partir de quantos ms uma consulta ao banco é registrada como lenta. */
    readonly slowQueryMs: number;
    /** Testes automatizados não poluem a saída. */
    readonly silent: boolean;
}

const DEFAULT_SLOW_REQUEST_MS = 1000;
const DEFAULT_SLOW_QUERY_MS = 500;

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? value as T : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
    return value !== undefined && /^\d+$/.test(value) ? Number(value) : fallback;
}

/**
 * Lê as variáveis de log direto do ambiente, com valores padrão para o que faltar.
 *
 * É tolerante de propósito: o logger precisa funcionar antes de o Nest subir (inclusive para
 * registrar uma configuração inválida). A validação estrita fica no provider de configuração.
 */
export function readLogSettings(env: NodeJS.ProcessEnv = process.env): LogSettings {
    const environment = env.APP_ENV || 'local';

    return {
        level: pick(env.LOG_LEVEL, LOG_LEVELS, 'info'),
        format: pick(env.LOG_FORMAT, LOG_FORMATS, environment === 'local' ? 'pretty' : 'json'),
        requestBody: pick(env.LOG_REQUEST_BODY, LOG_REQUEST_BODY_MODES, 'errors'),
        slowRequestMs: nonNegativeInteger(env.SLOW_REQUEST_MS, DEFAULT_SLOW_REQUEST_MS),
        slowQueryMs: nonNegativeInteger(env.SLOW_QUERY_MS, DEFAULT_SLOW_QUERY_MS),
        silent: env.NODE_ENV === 'test'
    };
}
