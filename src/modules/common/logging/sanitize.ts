/** Chaves cujo valor nunca vai para o log (senha, tokens, segredos, cookies...). */
const SENSITIVE_KEY = /pass(word)?|senha|token|secret|authorization|cookie|api[-_]?key|credential/i;

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 6;
/** Tamanho máximo (em caracteres de JSON) de um valor registrado. */
const MAX_JSON_LENGTH = 4096;

export const REDACTED = '[oculto]';

/**
 * Prepara um valor vindo de fora (corpo, query) para o log: oculta campos sensíveis,
 * encurta textos longos e listas grandes e limita o tamanho total.
 */
export function sanitizeForLog(value: unknown): unknown {
    const sanitized = sanitize(value, 0);
    const json = JSON.stringify(sanitized) ?? '';

    if (json.length <= MAX_JSON_LENGTH) {
        return sanitized;
    }

    return { truncated: true, size: json.length, preview: `${json.slice(0, MAX_JSON_LENGTH)}…` };
}

/** Encurta um texto longo, indicando quantos caracteres ficaram de fora. */
export function truncateText(value: string, maxLength: number = MAX_STRING_LENGTH): string {
    return value.length > maxLength
        ? `${value.slice(0, maxLength)}… (+${value.length - maxLength})`
        : value;
}

function sanitize(value: unknown, depth: number): unknown {
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return truncateText(value);
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (Buffer.isBuffer(value)) {
        return `[binário: ${value.length} bytes]`;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (depth >= MAX_DEPTH) {
        return '[…]';
    }

    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => sanitize(item, depth + 1));

        return value.length > MAX_ARRAY_ITEMS
            ? [...items, `… (+${value.length - MAX_ARRAY_ITEMS} itens)`]
            : items;
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1)])
        );
    }

    return `[${typeof value}]`;
}
