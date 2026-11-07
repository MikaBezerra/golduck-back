import type { Config } from '../../model';
import { jest } from '@jest/globals';
import { Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiProperty, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';

import {
    ApiDataResponse,
    ApiErrorResponses,
    ApiPaginatedResponse,
    DATE_PATTERN,
    DATE_TIME_PROPERTY,
    MONEY_PROPERTY,
    MONTH_PATTERN,
    MONTH_PROPERTY,
    UUID_PROPERTY
} from '../../swagger/api-docs';
import { setupSwagger, SWAGGER_PATH } from '../../swagger/swagger.setup';

class ProbeItemDto {
    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: string;
}

/** Controller só de teste, com cada forma de documentar uma resposta. */
@Controller('docs-teste')
class DocsProbeController {
    @Get('um')
    @ApiDataResponse(ProbeItemDto)
    public one(): void {
        // Só a documentação importa aqui.
    }

    @Get('lista')
    @ApiDataResponse(ProbeItemDto, { isArray: true })
    public list(): void {
        // Só a documentação importa aqui.
    }

    @Post('criado')
    @ApiDataResponse(ProbeItemDto, { status: HttpStatus.CREATED, description: 'Item criado' })
    public create(): void {
        // Só a documentação importa aqui.
    }

    @Get('paginas')
    @ApiPaginatedResponse(ProbeItemDto)
    public page(): void {
        // Só a documentação importa aqui.
    }

    @Get('paginas-descritas')
    @ApiPaginatedResponse(ProbeItemDto, { description: 'Itens encontrados' })
    public describedPage(): void {
        // Só a documentação importa aqui.
    }

    @Get('com-erros')
    @ApiErrorResponses()
    public withErrors(): void {
        // Só a documentação importa aqui.
    }
}

type Schema = Record<string, unknown>;
type Operation = { parameters?: Schema[]; responses: Record<string, { description: string; content?: { 'application/json': { schema: Schema } } }> };
type OpenApiDocument = {
    openapi: string;
    info: { title: string; description: string; version: string };
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema>; securitySchemes: Record<string, Schema> };
};

const ITEM_REF = { $ref: '#/components/schemas/ProbeItemDto' };

/*
 * Documentação OpenAPI: o setupSwagger publica /docs e /docs-json (fora do prefixo da API) e os
 * decorators de api-docs descrevem o envelope { data }, a paginação e o formato { error }.
 */
describe('documentação OpenAPI (Swagger)', () => {
    let app: NestFastifyApplication;
    let baseUrl: string;
    let document: OpenApiDocument;

    const operation = (path: string, method = 'get'): Operation => document.paths[path][method];
    const jsonSchema = (op: Operation, status: string): Schema | undefined => op.responses[status].content?.['application/json'].schema;

    beforeAll(async () => {
        // Os arquivos estáticos da interface (CSS/JS) vêm do @fastify/static, que o Jest em modo ESM não carrega por import()
        // dinâmico; as rotas /docs e /docs-json, que são o que importa aqui, continuam de verdade.
        jest.spyOn(SwaggerModule as unknown as { serveStatic: () => void }, 'serveStatic').mockImplementation(() => undefined);

        const moduleRef = await Test.createTestingModule({ controllers: [DocsProbeController] }).compile();
        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
        setupSwagger(app, { AUTH_COOKIE_NAME: 'cookie_de_teste' } as unknown as Config);
        await app.listen(0, '127.0.0.1');

        const { port } = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}`;
        document = await (await fetch(`${baseUrl}/docs-json`)).json() as OpenApiDocument;
    });

    afterAll(async () => {
        await app.close();
    });

    describe('setupSwagger', () => {
        it('publica a interface em /docs e o JSON em /docs-json', async () => {
            const page = await fetch(`${baseUrl}/docs`);

            expect(SWAGGER_PATH).toBe('docs');
            expect(page.status).toBe(200);
            expect(page.headers.get('content-type')).toContain('text/html');
            expect(document.openapi).toMatch(/^3\./);
        });

        it('título, versão e descrição com as regras gerais da API e o nome do cookie de sessão', () => {
            expect(document.info.title).toBe('Finanças API');
            expect(document.info.version).toBe('1.0');
            expect(document.info.description.split('\n\n')).toEqual([
                'Respostas de sucesso com conteúdo vêm em `{ "data": ... }`; respostas 204 não têm corpo.',
                'Erros vêm em `{ "error": { "code", "message", "requestId", "details"? } }`.',
                'Valores em reais trafegam como texto (`"1234.56"`) e meses como `"AAAA-MM"`.',
                'Sessão: o login devolve o access token (use em **Authorize → bearer**) e grava o refresh token '
                    + 'no cookie httpOnly `cookie_de_teste`, que o navegador envia sozinho em /auth/refresh e /auth/logout.'
            ]);
        });

        it('autenticação por bearer (access token) e pelo cookie de sessão', () => {
            expect(document.components.securitySchemes).toEqual({
                bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
                cookie: { type: 'apiKey', in: 'cookie', name: 'cookie_de_teste' }
            });
        });

        it('sempre inclui o formato de erro { error }, mesmo sem rota que o use', () => {
            const { schemas } = document.components;

            expect(schemas.ApiErrorResponseDto).toMatchObject({
                type: 'object',
                properties: { error: { $ref: '#/components/schemas/ApiErrorDto' } },
                required: ['error']
            });
            expect(schemas.ApiErrorDto).toMatchObject({ required: ['code', 'message', 'requestId'] });
            expect(Object.keys((schemas.ApiErrorDto as { properties: Schema }).properties)).toEqual(['code', 'message', 'requestId', 'details']);
            expect(schemas.ApiErrorDetailDto).toMatchObject({ required: ['field', 'code', 'message'] });
        });
    });

    describe('ApiDataResponse', () => {
        it('documenta 200 "Sucesso" com { data: Modelo } obrigatório', () => {
            expect(operation('/docs-teste/um').responses['200'].description).toBe('Sucesso');
            expect(jsonSchema(operation('/docs-teste/um'), '200')).toEqual({
                type: 'object',
                required: ['data'],
                properties: { data: ITEM_REF }
            });
        });

        it('isArray: { data: Modelo[] }', () => {
            expect(jsonSchema(operation('/docs-teste/lista'), '200')).toEqual({
                type: 'object',
                required: ['data'],
                properties: { data: { type: 'array', items: ITEM_REF } }
            });
        });

        it('aceita outro status e outra descrição', () => {
            const created = operation('/docs-teste/criado', 'post');

            expect(Object.keys(created.responses)).toEqual(['201']);
            expect(created.responses['201'].description).toBe('Item criado');
            expect(jsonSchema(created, '201')).toEqual({ type: 'object', required: ['data'], properties: { data: ITEM_REF } });
        });

        it('registra o modelo nos schemas, com os padrões de dinheiro, mês, UUID e data', () => {
            expect(document.components.schemas.ProbeItemDto).toEqual({
                type: 'object',
                properties: {
                    amount: { type: 'string', example: '1234.56', description: 'Valor em reais, como texto com ponto decimal' },
                    month: { type: 'string', example: '2026-11', pattern: MONTH_PATTERN, description: 'Mês no formato AAAA-MM' },
                    id: { type: 'string', format: 'uuid' },
                    createdAt: { type: 'string', format: 'date-time' }
                },
                required: ['amount', 'month', 'id', 'createdAt']
            });
        });
    });

    describe('ApiPaginatedResponse', () => {
        it('documenta as queries page e pageSize (opcionais, com limites e padrões)', () => {
            expect(operation('/docs-teste/paginas').parameters).toEqual([
                { name: 'page', required: false, in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
                { name: 'pageSize', required: false, in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }
            ]);
        });

        it('documenta { data: { items, page, pageSize, total, totalPages } }', () => {
            const paginated = operation('/docs-teste/paginas');

            expect(paginated.responses['200'].description).toBe('Página de resultados');
            expect(jsonSchema(paginated, '200')).toEqual({
                type: 'object',
                required: ['data'],
                properties: {
                    data: {
                        type: 'object',
                        required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
                        properties: {
                            items: { type: 'array', items: ITEM_REF },
                            page: { type: 'integer', example: 1 },
                            pageSize: { type: 'integer', example: 20 },
                            total: { type: 'integer', example: 42 },
                            totalPages: { type: 'integer', example: 3 }
                        }
                    }
                }
            });
        });

        it('aceita outra descrição', () => {
            expect(operation('/docs-teste/paginas-descritas').responses['200'].description).toBe('Itens encontrados');
        });
    });

    describe('ApiErrorResponses', () => {
        it('documenta a resposta padrão (qualquer outro status) com o formato { error }', () => {
            const op = operation('/docs-teste/com-erros');

            expect(op.responses.default.description).toBe('Erro: { error: { code, message, requestId, details? } }');
            expect(jsonSchema(op, 'default')).toEqual({ $ref: '#/components/schemas/ApiErrorResponseDto' });
        });
    });

    describe('padrões de texto', () => {
        it('MONTH_PATTERN aceita só AAAA-MM com mês de 01 a 12 e ano sem zero à esquerda', () => {
            const month = new RegExp(MONTH_PATTERN);

            expect(['2026-01', '2026-12', '1000-10'].every(value => month.test(value))).toBe(true);
            expect(['2026-00', '2026-13', '0999-01', '2026-1', '2026-011', 'x2026-01'].some(value => month.test(value))).toBe(false);
        });

        it('DATE_PATTERN aceita só AAAA-MM-DD', () => {
            const date = new RegExp(DATE_PATTERN);

            expect(date.test('2026-11-07')).toBe(true);
            expect(['2026-11-7', '2026-1-07', '26-11-07', '2026-11-07T00:00', 'x2026-11-07', '2026/11/07'].some(value => date.test(value))).toBe(false);
        });
    });
});
