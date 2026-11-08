import type { LogFormat, LogLevel, LogRequestBodyMode } from '../logging/log-settings.js';

export const AUTH_COOKIE_SAMESITE_VALUES = ['strict', 'lax', 'none'] as const;
export type AuthCookieSameSite = typeof AUTH_COOKIE_SAMESITE_VALUES[number];

export interface Config {
    /** Nome do ambiente (local, develop, production...): vai nos logs e em GET /version. */
    readonly APP_ENV: string;
    readonly API_PORT: number;
    readonly API_PREFIX: string;
    /**
     * Origens do front, já separadas: liberadas no CORS (com cookies) e aceitas nas rotas que mexem
     * no cookie de sessão. Vazio (ou ausente) mantém o CORS desligado.
     */
    readonly API_CORS_ORIGINS?: string[];
    /** "1" publica a documentação OpenAPI em /docs e /docs-json. */
    readonly SWAGGER_ENABLE?: '0' | '1';
    /**
     * Em quais proxies confiar para descobrir o IP real do cliente (X-Forwarded-For).
     * false = nenhum; true = todos; número = quantidade de saltos; texto = IPs/CIDRs separados por vírgula.
     */
    readonly TRUST_PROXY: boolean | number | string;
    readonly DATABASE_URL: string;
    readonly JWT_SECRET: string;
    readonly JWT_ISSUER: string;
    /** Nome do cookie httpOnly que guarda o refresh token. */
    readonly AUTH_COOKIE_NAME: string;
    /** strict, lax ou none: quando o navegador envia o cookie em chamadas vindas de outro site. */
    readonly AUTH_COOKIE_SAMESITE: AuthCookieSameSite;
    /** Domínio do cookie; vazio = só o endereço exato da API (o mais seguro). */
    readonly AUTH_COOKIE_DOMAIN?: string;
    /** Nível mínimo do log (padrão info). */
    readonly LOG_LEVEL?: LogLevel;
    /** pretty ou json (padrão: pretty no local, json nos demais ambientes). */
    readonly LOG_FORMAT?: LogFormat;
    /** Corpo das requisições no log: off, errors (padrão) ou all. */
    readonly LOG_REQUEST_BODY?: LogRequestBodyMode;
    /** Requisição registrada como lenta a partir de quantos ms (padrão 1000). */
    readonly SLOW_REQUEST_MS?: number;
    /** Consulta ao banco registrada como lenta a partir de quantos ms (padrão 500). */
    readonly SLOW_QUERY_MS?: number;
    /** Commit publicado; na Vercel vem de VERCEL_GIT_COMMIT_SHA. */
    readonly GIT_COMMIT_SHA?: string;
}
