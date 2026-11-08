import Joi from 'joi';

import { Service } from '../../tokens.js';
import { LOG_FORMATS, LOG_LEVELS, LOG_REQUEST_BODY_MODES } from '../logging/log-settings.js';
import { AUTH_COOKIE_SAMESITE_VALUES, Config } from '../model/index.js';
import { parseTrustProxy } from './trust-proxy.js';

/** Tamanho mínimo do segredo do JWT (HS256 pede pelo menos 256 bits). */
const JWT_SECRET_MIN_LENGTH = 32;
/** A Vercel recomenda um segredo aleatório de pelo menos 16 caracteres para o CRON_SECRET. */
const CRON_SECRET_MIN_LENGTH = 16;

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
            AUTH_COOKIE_NAME: Joi.string().empty('').default('refresh_token').pattern(/^[A-Za-z0-9_-]+$/),
            AUTH_COOKIE_SAMESITE: Joi.string().empty('').default('strict').valid(...AUTH_COOKIE_SAMESITE_VALUES),
            AUTH_COOKIE_DOMAIN: Joi.string().empty('').pattern(/^\.?(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i).optional(),
            LOG_LEVEL: Joi.string().empty('').valid(...LOG_LEVELS).optional(),
            LOG_FORMAT: Joi.string().empty('').valid(...LOG_FORMATS).optional(),
            LOG_REQUEST_BODY: Joi.string().empty('').valid(...LOG_REQUEST_BODY_MODES).optional(),
            SLOW_REQUEST_MS: Joi.number().empty('').integer().min(0).optional(),
            SLOW_QUERY_MS: Joi.number().empty('').integer().min(0).optional(),
            GIT_COMMIT_SHA: Joi.string().empty('').pattern(/^[0-9a-f]{7,40}$/i).optional(),
            MAIL_ENABLED: Joi.string().empty('').default('0').valid('0', '1'),
            MAIL_SMTP_HOST: Joi.string().empty('').default('smtp.gmail.com').hostname(),
            MAIL_SMTP_PORT: Joi.number().empty('').default(465).integer().min(1).max(65535),
            MAIL_SMTP_USER: Joi.string().empty('').when('MAIL_ENABLED', { is: '1', then: Joi.required(), otherwise: Joi.optional() }),
            MAIL_SMTP_PASS: Joi.string().empty('').when('MAIL_ENABLED', { is: '1', then: Joi.required(), otherwise: Joi.optional() }),
            MAIL_FROM: Joi.string().empty('').max(254).optional(),
            PLUGGY_CLIENT_ID: Joi.string().empty('').max(100).optional(),
            PLUGGY_CLIENT_SECRET: Joi.string().empty('').max(500).optional(),
            PLUGGY_API_URL: Joi.string().empty('').default('https://api.pluggy.ai').uri({ scheme: ['https', 'http'] })
                .pattern(/[^/]$/, 'no trailing slash'),
            CRON_SECRET: Joi.string().empty('').min(CRON_SECRET_MIN_LENGTH).optional()
        });

        const result = validationSchema.validate(env);
        if (result.error) {
            throw new Error(`Configuration not valid: ${result.error.message}`);
        }

        return result.value;
    }

};
