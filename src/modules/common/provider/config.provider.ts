import * as Joi from 'joi';

import { Service } from '../../tokens';
import { LOG_FORMATS, LOG_LEVELS, LOG_REQUEST_BODY_MODES } from '../logging/log-settings';
import { Config } from '../model';
import { parseTrustProxy } from './trust-proxy';

/** Tamanho mínimo do segredo do JWT (HS256 pede pelo menos 256 bits). */
const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Converte "https://app.exemplo.com, http://localhost:4200" em uma lista de origens.
 * Cada item precisa ser só protocolo + domínio (+ porta), sem caminho nem barra final.
 */
const parseCorsOrigins: Joi.CustomValidator<string, string[]> = (value, helpers) => {
    const origins = value.split(',').map(origin => origin.trim()).filter(Boolean);

    for (const origin of origins) {
        let url: URL;

        try {
            url = new URL(origin);
        } catch {
            return helpers.message({ custom: `API_CORS_ORIGINS contains an invalid origin: ${origin}` });
        }

        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
            return helpers.message({ custom: `API_CORS_ORIGINS must contain only origins like https://app.example.com: ${origin}` });
        }
    }

    return origins;
};

export const configProvider = {

    provide: Service.CONFIG,
    useFactory: (): Config => {

        const env = process.env;
        const validationSchema = Joi.object<Config>().unknown().keys({
            APP_ENV: Joi.string().empty('').default('local').pattern(/^[a-z][a-z0-9-]*$/),
            API_PORT: Joi.number().required(),
            API_PREFIX: Joi.string().required(),
            API_CORS_ORIGINS: Joi.string().empty('').optional().custom(parseCorsOrigins),
            SWAGGER_ENABLE: Joi.string().valid('0', '1').empty('').optional(),
            TRUST_PROXY: Joi.string().empty('').default('false').custom((value: string) => parseTrustProxy(value)),
            DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
            JWT_SECRET: Joi.string().min(JWT_SECRET_MIN_LENGTH).required(),
            JWT_ISSUER: Joi.string().required(),
            LOG_LEVEL: Joi.string().empty('').valid(...LOG_LEVELS).optional(),
            LOG_FORMAT: Joi.string().empty('').valid(...LOG_FORMATS).optional(),
            LOG_REQUEST_BODY: Joi.string().empty('').valid(...LOG_REQUEST_BODY_MODES).optional(),
            SLOW_REQUEST_MS: Joi.number().empty('').integer().min(0).optional(),
            SLOW_QUERY_MS: Joi.number().empty('').integer().min(0).optional(),
            GIT_COMMIT_SHA: Joi.string().empty('').pattern(/^[0-9a-f]{7,40}$/i).optional()
        });

        const result = validationSchema.validate(env);
        if (result.error) {
            throw new Error(`Configuration not valid: ${result.error.message}`);
        }

        return result.value;
    }

};
