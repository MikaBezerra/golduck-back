import type { ApiErrorDetail } from '../../common/http/response.types.js';

import { ValidationError } from '../../common/validation/validation-error.js';
import { LoginPipe } from '../flow/auth.pipe.js';

const PASSWORD = 'senha-correta-123';

/** E-mail com exatamente `length` caracteres (de 204 em diante), com partes no tamanho que o padrão permite. */
function emailWithLength(length: number): string {
    const label = 'b'.repeat(63);
    return `pessoa@${label}.${label}.${label}.${'c'.repeat(length - 203)}.com`;
}

/** Validação do corpo do login (Joi), direto no pipe: limites, normalização e campos extras. */
describe('LoginPipe', () => {
    const pipe = new LoginPipe();

    const detailsOf = (value: unknown): ApiErrorDetail[] => {
        try {
            pipe.transform(value);
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            return (error as ValidationError).details;
        }

        throw new Error('era esperado um erro de validação');
    };

    it('tira espaços e passa o e-mail para minúsculas; a senha fica exatamente como veio', () => {
        expect(pipe.transform({ email: '  Pessoa@Exemplo.COM ', password: ' Senha Com Espaços ' })).toEqual({
            email: 'pessoa@exemplo.com',
            password: ' Senha Com Espaços '
        });
    });

    it('e-mail e senha são obrigatórios (todos os erros de uma vez)', () => {
        expect(detailsOf({})).toEqual([
            { field: 'email', code: 'any.required', message: 'email é obrigatório' },
            { field: 'password', code: 'any.required', message: 'password é obrigatório' }
        ]);
    });

    it('recusa e-mail inválido', () => {
        for (const email of ['nao-e-email', 'pessoa@', '@exemplo.com', '   ']) {
            expect(detailsOf({ email, password: PASSWORD }).map(detail => detail.field)).toEqual(['email']);
        }
    });

    it('e-mail até 254 caracteres', () => {
        expect(pipe.transform({ email: emailWithLength(254), password: PASSWORD })).toMatchObject({ email: emailWithLength(254) });
        expect(detailsOf({ email: emailWithLength(255), password: PASSWORD }).map(detail => detail.code)).toContain('string.max');
    });

    it('senha de 1 a 1024 caracteres', () => {
        expect(pipe.transform({ email: 'pessoa@exemplo.com', password: 'x' })).toMatchObject({ password: 'x' });
        expect(pipe.transform({ email: 'pessoa@exemplo.com', password: 'x'.repeat(1024) })).toMatchObject({ password: 'x'.repeat(1024) });

        expect(detailsOf({ email: 'pessoa@exemplo.com', password: '' })).toEqual([expect.objectContaining({ field: 'password', code: 'string.empty' })]);
        expect(detailsOf({ email: 'pessoa@exemplo.com', password: 'x'.repeat(1025) })).toEqual([
            expect.objectContaining({ field: 'password', code: 'string.max' })
        ]);
    });

    it('recusa campos extras e tipos errados', () => {
        expect(detailsOf({ email: 'pessoa@exemplo.com', password: PASSWORD, lembrar: true })).toEqual([
            expect.objectContaining({ field: 'lembrar', code: 'object.unknown' })
        ]);
        expect(detailsOf({ email: 123, password: 456 }).map(detail => detail.code)).toEqual(['string.base', 'string.base']);
    });
});
