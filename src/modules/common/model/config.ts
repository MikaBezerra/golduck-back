export interface Config {

    readonly API_PORT: number;

    readonly API_PREFIX: string;


    readonly JWT_SECRET: string;

    readonly JWT_ISSUER: string;

    readonly PASSENGERS_ALLOWED: string;

}
