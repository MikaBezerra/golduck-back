import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
export const APP_VERSION_HEADER = 'x-app-version';

/** Ids aceitos quando vêm do cliente: sem espaços nem caracteres que quebrem logs. */
const INCOMING_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Id de cada requisição. Reaproveita o x-request-id enviado pelo cliente (o front gera um por
 * chamada, assim os logs dos dois lados se cruzam); se não vier ou for inválido, gera um UUID.
 */
export function generateRequestId(request: { headers: IncomingHttpHeaders }): string {
    const incoming = request.headers[REQUEST_ID_HEADER];

    return typeof incoming === 'string' && INCOMING_REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();
}
