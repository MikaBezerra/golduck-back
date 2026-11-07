import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Module, Post, Query } from '@nestjs/common';
import * as Joi from 'joi';

import { dataOf, errorOf, HttpTestApp } from '../../../../testing/http-test-app';
import { Public } from '../../../auth/security/auth.decorators';
import { ERRORS } from '../../errors/error-catalog';
import { JoiValidationPipePtbr } from '../../validation/joi-validation-ptbr.pipe';

class ProbeQueryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object({ size: Joi.number().integer().max(10).required() }).unknown(false);
    }
}

/** Controller só de teste: cada rota devolve ou lança uma coisa diferente. */
@Controller('teste-http')
@Public()
class HttpProbeController {
    @Get('objeto')
    public object(): { nome: string } {
        return { nome: 'Golduck' };
    }

    @Get('nulo')
    public nothing(): null {
        return null;
    }

    @Get('sem-retorno')
    public noReturn(): void {
        // Nada a devolver.
    }

    @Post('criar')
    public create(@Body() body: unknown): unknown {
        return body;
    }

    @Delete('remover')
    @HttpCode(204)
    public remove(): { removido: boolean } {
        return { removido: true };
    }

    @Get('limite')
    public limited(): never {
        throw ERRORS.tooManyRequests('teste_limite', 12.3);
    }

    @Get('proibido')
    public forbidden(): never {
        throw new ForbiddenException('detalhe interno do Nest');
    }

    @Get('falha')
    public fail(): never {
        throw new Error('senha do banco: 123');
    }

    @Get('validacao')
    public validate(@Query(ProbeQueryPipe) query: { size: number }): { size: number } {
        return query;
    }
}

@Module({ controllers: [HttpProbeController] })
class HttpProbeModule { }

/*
 * Envelope das respostas por HTTP, com a API montada de verdade (filtro e interceptor globais do
 * CommonModule): { data } no sucesso, nada no 204 e { error } com requestId em qualquer erro.
 */
describe('envelope das respostas HTTP', () => {
    let api: HttpTestApp;

    beforeAll(async () => {
        api = await HttpTestApp.create({ imports: [HttpProbeModule] });
    });

    afterAll(async () => {
        await api.close();
    });

    describe('sucesso', () => {
        it('GET devolve 200 com o valor em { data }, inclusive null', async () => {
            const object = await api.get('/teste-http/objeto');
            const nothing = await api.get('/teste-http/nulo');

            expect(object.status).toBe(200);
            expect(object.body).toEqual({ data: { nome: 'Golduck' } });
            expect(nothing.status).toBe(200);
            expect(nothing.body).toEqual({ data: null });
        });

        it('POST devolve 201 com o valor em { data }', async () => {
            const response = await api.post('/teste-http/criar', { nome: 'Novo' });

            expect(response.status).toBe(201);
            expect(dataOf(response)).toEqual({ nome: 'Novo' });
        });

        it('rota sem retorno responde sem corpo', async () => {
            const response = await api.get('/teste-http/sem-retorno');

            expect(response.status).toBe(200);
            expect(response.body).toBeUndefined();
        });

        it('204 nunca tem corpo, mesmo que o controller devolva algo', async () => {
            const response = await api.delete('/teste-http/remover');

            expect(response.status).toBe(204);
            expect(response.body).toBeUndefined();
        });
    });

    describe('erros', () => {
        it('AppError: status, código e mensagem do erro e os headers dele (Retry-After)', async () => {
            const response = await api.get('/teste-http/limite');

            expect(response.status).toBe(429);
            expect(response.headers['retry-after']).toBe('13');
            expect(response.body).toEqual({
                error: {
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
                    requestId: response.headers['x-request-id']
                }
            });
        });

        it('HttpException do Nest: código e mensagem em português, sem a mensagem original', async () => {
            const response = await api.get('/teste-http/proibido');

            expect(response.status).toBe(403);
            expect(errorOf(response)).toEqual({ code: 'FORBIDDEN', message: 'Acesso negado', requestId: response.headers['x-request-id'] });
            expect(JSON.stringify(response.body)).not.toContain('detalhe interno');
        });

        it('rota inexistente: 404 NOT_FOUND no mesmo formato', async () => {
            const response = await api.get('/rota-que-nao-existe');

            expect(response.status).toBe(404);
            expect(errorOf(response)).toMatchObject({ code: 'NOT_FOUND', message: 'Recurso não encontrado' });
        });

        it('erro inesperado: 500 genérico, sem vazar mensagem nem pilha', async () => {
            const response = await api.get('/teste-http/falha');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', requestId: response.headers['x-request-id'] }
            });
            expect(response.headers['retry-after']).toBeUndefined();
        });

        it('validação: 400 VALIDATION_ERROR com os detalhes de cada campo', async () => {
            const valid = await api.get('/teste-http/validacao', { query: { size: '10' } });
            const invalid = await api.get('/teste-http/validacao', { query: { size: '11', extra: '1' } });

            expect(dataOf(valid)).toEqual({ size: 10 });
            expect(invalid.status).toBe(400);
            expect(errorOf(invalid)).toEqual({
                code: 'VALIDATION_ERROR',
                message: 'Os dados enviados são inválidos',
                requestId: invalid.headers['x-request-id'],
                details: [
                    { field: 'size', code: 'number.max', message: 'size deve ser menor ou igual a 10' },
                    { field: 'extra', code: 'object.unknown', message: 'extra não é permitido' }
                ]
            });
        });

        it('o requestId do erro é o x-request-id enviado pelo cliente', async () => {
            const response = await api.get('/teste-http/proibido', { headers: { 'x-request-id': 'suporte-0001' } });

            expect(errorOf(response).requestId).toBe('suporte-0001');
        });
    });
});
