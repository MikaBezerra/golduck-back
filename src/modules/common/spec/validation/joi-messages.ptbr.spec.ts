import * as Joi from 'joi';

import { JOI_MESSAGES_PTBR } from '../../validation/joi-messages.ptbr';

const OPTIONS: Joi.ValidationOptions = { abortEarly: false, messages: JOI_MESSAGES_PTBR, errors: { wrap: { label: false } } };

/** Mensagem do primeiro erro ao validar value com o schema, usando as mensagens em português. */
function messageOf(schema: Joi.Schema, value: unknown): string | undefined {
    return schema.validate(value, OPTIONS).error?.details[0].message;
}

/** Tipos do Joi e os códigos de erro que cada um conhece (lidos da definição interna do Joi). */
const JOI_TYPES = ['any', 'alternatives', 'array', 'boolean', 'binary', 'date', 'function', 'link', 'number', 'object', 'string', 'symbol'] as const;

function joiErrorCodes(): string[] {
    return JOI_TYPES.flatMap(type => {
        const schema = (Joi[type] as () => unknown)() as { _definition: { messages?: Record<string, unknown> } };

        return Object.keys(schema._definition.messages ?? {}); // eslint-disable-line no-underscore-dangle
    });
}

/** Mensagens de validação do Joi traduzidas para o português. */
describe('JOI_MESSAGES_PTBR', () => {
    it('tem tradução para todo código de erro do Joi (nenhum cai na mensagem em inglês)', () => {
        const codes = joiErrorCodes();

        expect(codes.length).toBeGreaterThan(100);
        expect(codes.filter(code => !(code in JOI_MESSAGES_PTBR))).toEqual([]);
    });

    it('toda mensagem é não vazia e cita o campo; o rótulo da raiz é "valor"', () => {
        const { root, ...messages } = JOI_MESSAGES_PTBR;

        expect(root).toBe('valor');

        for (const [code, message] of Object.entries(messages)) {
            expect([code, message.includes('{{#label}}')]).toEqual([code, true]);
            expect([code, message.replace('{{#label}}', '').trim().length > 5]).toEqual([code, true]);
        }
    });

    it('nenhuma mensagem ficou em inglês', () => {
        const english = /\b(must|should|is required|not allowed|invalid value|contains)\b/;

        expect(Object.values(JOI_MESSAGES_PTBR).filter(message => english.test(message))).toEqual([]);
    });

    it.each([
        [Joi.object({ name: Joi.string().required() }), {}, 'name é obrigatório'],
        [Joi.object({ name: Joi.string() }), { name: '' }, 'name não pode estar vazio'],
        [Joi.object({ name: Joi.string() }), { name: 10 }, 'name deve ser um texto'],
        [Joi.object({ name: Joi.string().min(3) }), { name: 'ab' }, 'name deve ter pelo menos 3 caracteres'],
        [Joi.object({ name: Joi.string().max(3) }), { name: 'abcd' }, 'name deve ter no máximo 3 caracteres'],
        [Joi.object({ code: Joi.string().length(2) }), { code: 'abc' }, 'code deve ter exatamente 2 caracteres'],
        [Joi.object({ email: Joi.string().email() }), { email: 'x' }, 'email deve conter um e-mail válido'],
        [Joi.object({ id: Joi.string().guid() }), { id: '123' }, 'id deve conter um UUID válido'],
        [Joi.object({ month: Joi.string().pattern(/^\d+$/) }), { month: 'x' }, 'month não corresponde ao formato exigido'],
        [Joi.object({ amount: Joi.number() }), { amount: 'dez' }, 'amount deve ser um número'],
        [Joi.object({ amount: Joi.number().min(1) }), { amount: 0 }, 'amount deve ser maior ou igual a 1'],
        [Joi.object({ amount: Joi.number().max(9) }), { amount: 10 }, 'amount deve ser menor ou igual a 9'],
        [Joi.object({ amount: Joi.number().greater(1) }), { amount: 1 }, 'amount deve ser maior que 1'],
        [Joi.object({ amount: Joi.number().less(1) }), { amount: 1 }, 'amount deve ser menor que 1'],
        [Joi.object({ amount: Joi.number().integer() }), { amount: 1.5 }, 'amount deve ser um número inteiro'],
        [Joi.object({ amount: Joi.number().positive() }), { amount: -1 }, 'amount deve ser positivo'],
        [Joi.object({ amount: Joi.number().precision(2).strict() }), { amount: 1.234 }, 'amount deve ter no máximo 2 casas decimais'],
        [Joi.object({ active: Joi.boolean() }), { active: 'talvez' }, 'active deve ser verdadeiro ou falso'],
        [Joi.object({ when: Joi.date() }), { when: 'ontem' }, 'when deve ser uma data válida'],
        [Joi.object({ kind: Joi.string().valid('a', 'b') }), { kind: 'c' }, 'kind deve conter um dos valores permitidos'],
        [Joi.object({ kind: Joi.string().invalid('x') }), { kind: 'x' }, 'kind contém um valor inválido'],
        [Joi.object({ ids: Joi.array() }), { ids: 'x' }, 'ids deve ser uma lista'],
        [Joi.object({ ids: Joi.array().min(1) }), { ids: [] }, 'ids deve conter pelo menos 1 itens'],
        [Joi.object({ ids: Joi.array().max(1) }), { ids: [1, 2] }, 'ids deve conter no máximo 1 itens'],
        [Joi.object({ ids: Joi.array().unique() }), { ids: [1, 1] }, 'ids[1] contém itens repetidos'],
        [Joi.object({}).unknown(false), { extra: 1 }, 'extra não é permitido'],
        [Joi.object({ a: Joi.any(), b: Joi.any() }).xor('a', 'b'), { a: 1, b: 2 }, 'valor exige exatamente um dos campos relacionados'],
        [Joi.object({ a: Joi.any(), b: Joi.any() }).or('a', 'b'), {}, 'valor exige pelo menos um dos campos relacionados'],
        [Joi.object({ a: Joi.any(), b: Joi.any() }).nand('a', 'b'), { a: 1, b: 2 }, 'valor contém campos incompatíveis'],
        [Joi.object({ a: Joi.any() }).min(1), {}, 'valor deve conter pelo menos 1 campos'],
        [Joi.object(), 'texto', 'valor deve ser um objeto']
    ])('%#: mensagem em português', (schema, value, message) => {
        expect(messageOf(schema, value)).toBe(message);
    });

    it('código sem tradução própria (regra personalizada) usa a mensagem genérica', () => {
        const schema = Joi.object({ code: Joi.any().custom((_, helpers) => helpers.error('regra.propria')) });

        expect(messageOf(schema, { code: 1 })).toBe('code contém um valor inválido');
    });
});
