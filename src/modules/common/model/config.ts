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
    /** "1" liga o envio do resumo por e-mail (padrão "0": o botão responde 503 MAIL_DISABLED). */
    readonly MAIL_ENABLED: '0' | '1';
    /** Servidor SMTP (padrão smtp.gmail.com). */
    readonly MAIL_SMTP_HOST: string;
    /** Porta SMTP (padrão 465, com TLS direto; 587 usa STARTTLS). */
    readonly MAIL_SMTP_PORT: number;
    /** Usuário SMTP (no Gmail, o endereço). Obrigatório com MAIL_ENABLED=1. */
    readonly MAIL_SMTP_USER?: string;
    /** Senha SMTP (no Gmail, a senha de app). Obrigatória com MAIL_ENABLED=1. */
    readonly MAIL_SMTP_PASS?: string;
    /** Remetente, como "Golduck <voce@gmail.com>"; vazio = "Golduck <MAIL_SMTP_USER>". */
    readonly MAIL_FROM?: string;
    /** Client ID da aplicação no Pluggy Dashboard. Sem ele (ou sem o secret), a sincronização responde 503 PLUGGY_DISABLED. */
    readonly PLUGGY_CLIENT_ID?: string;
    /** Client Secret da aplicação no Pluggy Dashboard (segredo). */
    readonly PLUGGY_CLIENT_SECRET?: string;
    /** Endereço da API da Pluggy (padrão https://api.pluggy.ai). */
    readonly PLUGGY_API_URL: string;
    /** Chave da rotina diária da Vercel (header Authorization: Bearer). Sem ela, GET /card-sync/cron responde 401. */
    readonly CRON_SECRET?: string;
}
