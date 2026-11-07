export interface Config {

    readonly API_PORT: number;

    readonly API_PREFIX: string;

    /** Origens liberadas no CORS, já separadas. Vazio (ou ausente) mantém o CORS desligado. */
    readonly API_CORS_ORIGINS?: string[];

    readonly JWT_SECRET: string;

    readonly JWT_ISSUER: string;

    readonly PASSENGERS_ALLOWED: string;

}
