import Joi from 'joi';

import { AppError } from '../../errors/app-error.js';
import { JoiValidationPipePtbr } from '../../validation/joi-validation-ptbr.pipe.js';
import { ValidationError } from '../../validation/validation-error.js';

/** Pipe de teste: o schema vem de fora, para cada cenário montar o seu. */
class SchemaPipe extends JoiValidationPipePtbr {
    public constructor(private readonly schema: Joi.Schema) {
        super();
    }

    public buildSchema(): Joi.Schema {
        return this.schema;
    }
}

/** Os detalhes do erro de validação lançado pelo pipe (falha o teste se não lançar). */
function validationError(run: () => unknown): ValidationError {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        return error as ValidationError;
    }

    throw new Error('o pipe deveria ter recusado o valor');
}

/**
 * Base dos pipes de validação: valida com Joi, devolve o valor convertido e, se houver erro,
 * lança ValidationError (400) com todos os campos rejeitados, em português.
 */
describe('JoiValidationPipePtbr', () => {
    it('devolve o valor já convertido pelo schema (texto → número, padrões, trim)', () => {
        const pipe = new SchemaPipe(Joi.object({
            page: Joi.number().default(1),
            pageSize: Joi.number(),
            name: Joi.string().trim()
        }));

        expect(pipe.transform({ pageSize: '50', name: '  Ana ' })).toEqual({ page: 1, pageSize: 50, name: 'Ana' });
    });

    it('lança ValidationError (VALIDATION_ERROR, 400) com cada erro em { field, code, message }', () => {
        const pipe = new SchemaPipe(Joi.object({ name: Joi.string().max(5).required() }));

        const error = validationError(() => pipe.transform({ name: 'Golduck' }));

        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400, publicMessage: 'Os dados enviados são inválidos' });
        expect(error.details).toEqual([{ field: 'name', code: 'string.max', message: 'name deve ter no máximo 5 caracteres' }]);
    });

    it('junta todos os erros de uma vez (não para no primeiro)', () => {
        const pipe = new SchemaPipe(Joi.object({
            name: Joi.string().required(),
            age: Joi.number().min(18)
        }).unknown(false));

        const { details } = validationError(() => pipe.transform({ age: 10, color: 'azul' }));

        expect(details).toEqual([
            { field: 'name', code: 'any.required', message: 'name é obrigatório' },
            { field: 'age', code: 'number.min', message: 'age deve ser maior ou igual a 18' },
            { field: 'color', code: 'object.unknown', message: 'color não é permitido' }
        ]);
    });

    it('mensagens sem aspas em volta do nome do campo', () => {
        const pipe = new SchemaPipe(Joi.object({ email: Joi.string().email() }));

        const { details } = validationError(() => pipe.transform({ email: 'nao-e-email' }));

        expect(details[0].message).toBe('email deve conter um e-mail válido');
        expect(details[0].message).not.toContain('"');
    });

    it('caminho do campo: objetos com ponto, listas com [índice] e "$" para o corpo inteiro', () => {
        const pipe = new SchemaPipe(Joi.object({
            address: Joi.object({ city: Joi.string().required() }),
            items: Joi.array().items(Joi.object({ name: Joi.string().required() })),
            matrix: Joi.array().items(Joi.array().items(Joi.number()))
        }).min(1));

        const nested = validationError(() => pipe.transform({
            address: {},
            items: [{ name: 'ok' }, {}, 'x'],
            matrix: [[1], [2, 'três']]
        }));
        const root = validationError(() => pipe.transform({}));
        const notObject = validationError(() => pipe.transform('texto'));

        expect(nested.details).toEqual([
            { field: 'address.city', code: 'any.required', message: 'address.city é obrigatório' },
            { field: 'items[1].name', code: 'any.required', message: 'items[1].name é obrigatório' },
            { field: 'items[2]', code: 'object.base', message: 'items[2] deve ser um objeto' },
            { field: 'matrix[1][1]', code: 'number.base', message: 'matrix[1][1] deve ser um número' }
        ]);
        expect(root.details).toEqual([{ field: '$', code: 'object.min', message: 'valor deve conter pelo menos 1 campos' }]);
        expect(notObject.details).toEqual([{ field: '$', code: 'object.base', message: 'valor deve ser um objeto' }]);
    });

    it('lista na raiz: o campo começa pelo índice', () => {
        const pipe = new SchemaPipe(Joi.array().items(Joi.object({ name: Joi.string().required() })));

        const { details } = validationError(() => pipe.transform([{ name: 'ok' }, {}]));

        expect(details).toEqual([{ field: '[1].name', code: 'any.required', message: '[1].name é obrigatório' }]);
    });

    it('regra personalizada sem mensagem própria usa a mensagem genérica em português', () => {
        const pipe = new SchemaPipe(Joi.object({
            code: Joi.string().custom((value: string, helpers) => (value === 'ok' ? value : helpers.error('code.custom')))
        }));

        const { details } = validationError(() => pipe.transform({ code: 'ruim' }));

        expect(details).toEqual([{ field: 'code', code: 'code.custom', message: 'code contém um valor inválido' }]);
    });

    it('mensagem definida no schema tem prioridade sobre a tradução padrão', () => {
        const pipe = new SchemaPipe(Joi.object({
            month: Joi.string().pattern(/^\d{4}-\d{2}$/).messages({ 'string.pattern.base': 'O mês deve estar no formato AAAA-MM' })
        }));

        const { details } = validationError(() => pipe.transform({ month: '11/2026' }));

        expect(details).toEqual([{ field: 'month', code: 'string.pattern.base', message: 'O mês deve estar no formato AAAA-MM' }]);
    });
});

describe('ValidationError', () => {
    it('é um AppError 400 com os detalhes recebidos', () => {
        const details = [{ field: 'name', code: 'any.required', message: 'name é obrigatório' }];

        const error = new ValidationError(details);

        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            publicMessage: 'Os dados enviados são inválidos',
            message: 'Os dados enviados são inválidos',
            reason: undefined,
            headers: {}
        });
        expect(error.details).toBe(details);
    });
});
