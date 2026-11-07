import * as Joi from 'joi';

import { Service } from '../../tokens';
import { Config } from '../model';

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
            API_PORT: Joi.number().required(),
            API_PREFIX: Joi.string().required(),
            API_CORS_ORIGINS: Joi.string().empty('').optional().custom(parseCorsOrigins),
            SWAGGER_ENABLE: Joi.string().valid('0', '1').empty('').optional(),
            JWT_SECRET: Joi.string().required(),
            JWT_ISSUER: Joi.string().required()
        });

        const result = validationSchema.validate(env);
        if (result.error) {
            throw new Error(`Configuration not valid: ${result.error.message}`);
        }

        return result.value;
    }

};
