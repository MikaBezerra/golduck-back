import { isIP } from 'node:net';

export type TrustProxy = boolean | number | string;

/**
 * Converte TRUST_PROXY no formato aceito pelo Fastify.
 *
 * - vazio, ausente ou "false": não confia em proxy (o IP é o da conexão);
 * - "true": confia em todos (ex.: Vercel, onde só o proxy da plataforma alcança a API);
 * - número: quantidade de proxies à frente da API;
 * - lista de IPs/CIDRs separados por vírgula: só esses proxies.
 *
 * Fica fora do provider de configuração porque o Fastify precisa do valor antes de o Nest subir.
 */
export function parseTrustProxy(value: string | undefined): TrustProxy {
    const normalized = value?.trim() ?? '';

    if (normalized === '' || normalized === 'false') {
        return false;
    }

    if (normalized === 'true') {
        return true;
    }

    if (/^\d+$/.test(normalized)) {
        return Number(normalized);
    }

    const entries = normalized.split(',').map(entry => entry.trim()).filter(Boolean);
    const invalid = entries.find(entry => {
        const [address, prefix] = entry.split('/');
        return isIP(address) === 0 || (prefix !== undefined && !/^\d{1,3}$/.test(prefix));
    });

    if (entries.length === 0 || invalid !== undefined) {
        throw new Error(`TRUST_PROXY must be true, false, a number of hops or a list of IPs/CIDRs: ${invalid ?? normalized}`);
    }

    return entries.join(',');
}

/**
 * Mesmo valor de parseTrustProxy, no tipo que o FastifyAdapter aceita.
 * O tipo do adapter não prevê número; a quantidade de saltos vira a função equivalente.
 */
export function fastifyTrustProxy(value: string | undefined): boolean | string | ((address: string, hop: number) => boolean) {
    const trustProxy = parseTrustProxy(value);

    return typeof trustProxy === 'number'
        ? (_address: string, hop: number) => hop < trustProxy
        : trustProxy;
}
