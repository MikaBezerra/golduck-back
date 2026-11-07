export interface Config {
    readonly API_PORT: number;
    readonly API_PREFIX: string;
    /** Origens liberadas no CORS, já separadas. Vazio (ou ausente) mantém o CORS desligado. */
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
}
