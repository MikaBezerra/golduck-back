import type { Config } from '../model';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiErrorResponseDto } from './api-docs';

export const SWAGGER_PATH = 'docs';

/**
 * Publica a documentação OpenAPI em /docs (interface) e /docs-json (JSON),
 * fora do prefixo /api. Ligado apenas com SWAGGER_ENABLE=1.
 */
export function setupSwagger(app: INestApplication, config: Config): void {
    const documentConfig = new DocumentBuilder()
        .setTitle('Finanças API')
        .setDescription([
            'Respostas de sucesso com conteúdo vêm em `{ "data": ... }`; respostas 204 não têm corpo.',
            'Erros vêm em `{ "error": { "code", "message", "requestId", "details"? } }`.',
            'Valores em reais trafegam como texto (`"1234.56"`) e meses como `"AAAA-MM"`.',
            'Sessão: o login devolve o access token (use em **Authorize → bearer**) e grava o refresh token '
                + `no cookie httpOnly \`${config.AUTH_COOKIE_NAME}\`, que o navegador envia sozinho em /auth/refresh e /auth/logout.`
        ].join('\n\n'))
        .setVersion('1.0')
        .addBearerAuth()
        .addCookieAuth(config.AUTH_COOKIE_NAME)
        .build();
    const document = SwaggerModule.createDocument(app, documentConfig, {
        extraModels: [ApiErrorResponseDto]
    });

    SwaggerModule.setup(SWAGGER_PATH, app, document, {
        jsonDocumentUrl: `${SWAGGER_PATH}-json`
    });
}
