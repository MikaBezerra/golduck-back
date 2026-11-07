import { describeError } from '../../logging/describe-error';

/** Qualquer coisa lançada (Error ou não) vira os mesmos campos no log. */
describe('describeError', () => {
    it('Error: nome, mensagem e pilha', () => {
        const error = new TypeError('valor inválido');

        expect(describeError(error)).toEqual({ errorName: 'TypeError', errorMessage: 'valor inválido', stack: error.stack });
        expect(error.stack).toContain('TypeError: valor inválido');
    });

    it('Error sem pilha não leva o campo stack', () => {
        const error = new Error('sem pilha');
        error.stack = undefined;

        const description = describeError(error);

        expect(description).toEqual({ errorName: 'Error', errorMessage: 'sem pilha' });
        expect('stack' in description).toBe(false);
    });

    it('Error com pilha vazia também não leva o campo stack', () => {
        const error = new Error('pilha vazia');
        error.stack = '';

        expect('stack' in describeError(error)).toBe(false);
    });

    it('texto lançado vira a mensagem, com o nome genérico "Erro"', () => {
        expect(describeError('deu ruim')).toEqual({ errorName: 'Erro', errorMessage: 'deu ruim' });
    });

    it('outros valores viram JSON (ou o texto equivalente, quando não têm JSON)', () => {
        expect(describeError({ code: 'X', status: 500 })).toEqual({ errorName: 'Erro', errorMessage: '{"code":"X","status":500}' });
        expect(describeError(42)).toEqual({ errorName: 'Erro', errorMessage: '42' });
        expect(describeError(null)).toEqual({ errorName: 'Erro', errorMessage: 'null' });
        expect(describeError(undefined)).toEqual({ errorName: 'Erro', errorMessage: 'undefined' });
        expect(describeError(Symbol('motivo'))).toEqual({ errorName: 'Erro', errorMessage: 'Symbol(motivo)' });
    });
});
