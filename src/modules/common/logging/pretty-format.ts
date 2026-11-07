import type * as winston from 'winston';

const ANSI_RESET = '\u001b[0m';
const ANSI_DIM = '\u001b[2m';
const ANSI_CYAN = '\u001b[36m';
const ANSI_GREEN = '\u001b[32m';
const ANSI_YELLOW = '\u001b[33m';
const ANSI_RED = '\u001b[31m';
const ANSI_MAGENTA = '\u001b[35m';

const LEVEL_COLORS: Record<string, string> = {
    error: ANSI_RED,
    warn: ANSI_YELLOW,
    info: ANSI_GREEN,
    debug: ANSI_MAGENTA
};

/** Campos que o winston já trata ou que viram linhas próprias. */
const BASE_FIELDS = new Set(['level', 'message', 'timestamp', 'errorName', 'errorMessage', 'stack']);

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});

type LogInfo = winston.Logform.TransformableInfo;

/**
 * Formato legível para desenvolvimento: uma linha de resumo por evento e, abaixo, código do erro,
 * detalhes da validação, corpo (só em falhas) e pilha.
 *
 * [API] 1234 - 07/11 13:15:05  WARN   POST   /api/auth/login  429 +1ms  [3f2a9c1e]
 *     ↳ TOO_MANY_REQUESTS · rate_limit: 5/60s
 */
export function formatPretty(info: LogInfo): string {
    const time = TIME_FORMAT.format(new Date(String(info.timestamp))).replace(',', '');
    const level = color(info.level.toUpperCase().padEnd(5), LEVEL_COLORS[info.level] ?? ANSI_GREEN);
    const prefix = `[API] ${process.pid} - ${time}  ${level}`;
    const lines = typeof info.method === 'string' && typeof info.path === 'string'
        ? formatRequest(info, prefix)
        : [`${prefix} ${String(info.message)}${formatExtras(info)}`];

    return [...lines, ...formatError(info)].join('\n');
}

function formatRequest(info: LogInfo, prefix: string): string[] {
    const statusCode = typeof info.statusCode === 'number' ? info.statusCode : 0;
    const statusColor = statusCode >= 500 ? ANSI_RED : statusCode >= 400 ? ANSI_YELLOW : ANSI_GREEN;
    const requestId = typeof info.requestId === 'string' ? info.requestId.slice(0, 8) : '-';
    const slow = info.slow === true ? color(' lenta', ANSI_YELLOW) : '';
    const user = typeof info.userEmail === 'string'
        ? `  ${info.userEmail}${typeof info.role === 'string' ? ` (${info.role})` : ''}`
        : typeof info.userId === 'string' ? `  usuário=${info.userId}` : '';
    const lines = [
        `${prefix}  ${color(String(info.method).padEnd(6), ANSI_CYAN)} ${String(info.path)}${formatQuery(info.query)}`
        + `  ${color(String(statusCode), statusColor)} +${typeof info.durationMs === 'number' ? info.durationMs : 0}ms${slow}`
        + `  ${color(`[${requestId}]`, ANSI_DIM)}${user}`
    ];

    if (typeof info.code === 'string') {
        const reason = typeof info.reason === 'string' ? ` · ${info.reason}` : '';
        lines.push(`    ↳ ${color(info.code, statusColor)}${reason}`);
    }

    if (info.details !== undefined) {
        lines.push(`    ↳ detalhes: ${JSON.stringify(info.details)}`);
    }

    // O corpo só aparece nas falhas, para o terminal não virar uma parede de JSON.
    if (info.body !== undefined && statusCode >= 400) {
        lines.push(`    ↳ corpo: ${JSON.stringify(info.body)}`);
    }

    return lines;
}

function formatQuery(query: unknown): string {
    if (query === null || typeof query !== 'object' || Object.keys(query).length === 0) {
        return '';
    }

    const params = Object.entries(query as Record<string, unknown>)
        .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join('&');

    return color(`?${params}`, ANSI_DIM);
}

/** Demais campos de um evento que não é de requisição, como "port=3000  version=0.1.0". */
function formatExtras(info: LogInfo): string {
    const extras = Object.entries(info)
        .filter(([key, value]) => !BASE_FIELDS.has(key) && value !== undefined)
        .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);

    return extras.length > 0 ? `  ${color(extras.join('  '), ANSI_DIM)}` : '';
}

function formatError(info: LogInfo): string[] {
    const lines: string[] = [];

    if (typeof info.errorMessage === 'string') {
        const name = typeof info.errorName === 'string' ? info.errorName : 'Erro';
        lines.push(`    ↳ ${name}: ${info.errorMessage}`);
    }

    if (typeof info.stack === 'string') {
        lines.push(...info.stack.split('\n').slice(1).map(line => `      ${line.trim()}`));
    }

    return lines;
}

function color(value: string, ansiCode: string): string {
    const forced = process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0';

    if (process.env.NO_COLOR !== undefined || (!process.stdout.isTTY && !process.stderr.isTTY && !forced)) {
        return value;
    }

    return `${ansiCode}${value}${ANSI_RESET}`;
}
