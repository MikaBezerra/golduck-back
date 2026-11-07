export interface Config {

    readonly API_PORT: number;

    readonly API_PREFIX: string;

    /** Origens liberadas no CORS, já separadas. Vazio (ou ausente) mantém o CORS desligado. */
    readonly API_CORS_ORIGINS?: string[];

    /** "1" publica a documentação OpenAPI em /docs e /docs-json. */
    readonly SWAGGER_ENABLE?: '0' | '1';

    readonly JWT_SECRET: string;

    readonly JWT_ISSUER: string;

}
