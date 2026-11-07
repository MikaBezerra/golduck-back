import { ValidationError } from '../../common/validation/validation-error';
import { AnnualSummaryQueryPipe, SummaryQueryPipe } from '../flow/summary.pipe';

/** Os detalhes do erro de validação lançado pelo pipe (falha o teste se não lançar). */
function validationDetails(run: () => unknown): ValidationError['details'] {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        return (error as ValidationError).details;
    }

    throw new Error('o pipe deveria ter recusado o valor');
}

/** Validação das queries do resumo, direto nos pipes (limites do formato e do ano). */
describe('SummaryQueryPipe', () => {
    const pipe = new SummaryQueryPipe();

    it.each(['1000-01', '2026-01', '2026-09', '2026-10', '2026-11', '2026-12', '9999-12'])('aceita o mês %s', month => {
        expect(pipe.transform({ month })).toEqual({ month });
    });

    it.each([
        '0999-12', '0026-01', '226-01', '20266-01', 'x2026-01', '2026-01x', '2026-011', '2026-1', '2026-00',
        '2026-13', '2026-20', '2026/01', '2026-1a', 'abcd-01', ' 2026-01', ''
    ])('recusa o mês "%s"', month => {
        const details = validationDetails(() => pipe.transform({ month }));

        expect(details).toHaveLength(1);
        expect(details[0].field).toBe('month');
    });

    it('formato errado traz a mensagem própria do mês', () => {
        expect(validationDetails(() => pipe.transform({ month: '2026-13' }))).toEqual([
            { field: 'month', code: 'string.pattern.base', message: 'O mês deve estar no formato AAAA-MM' }
        ]);
    });

    it('mês é obrigatório e campos extras são recusados (todos os erros de uma vez)', () => {
        expect(validationDetails(() => pipe.transform({}))).toEqual([
            { field: 'month', code: 'any.required', message: 'month é obrigatório' }
        ]);
        expect(validationDetails(() => pipe.transform({ month: '2026-1', year: '2026' }))).toEqual([
            { field: 'month', code: 'string.pattern.base', message: 'O mês deve estar no formato AAAA-MM' },
            { field: 'year', code: 'object.unknown', message: 'year não é permitido' }
        ]);
    });
});

describe('AnnualSummaryQueryPipe', () => {
    const pipe = new AnnualSummaryQueryPipe();

    it('aceita de 2000 a 2100 e converte o texto da query em número', () => {
        expect(pipe.transform({ year: '2000' })).toEqual({ year: 2000 });
        expect(pipe.transform({ year: '2100' })).toEqual({ year: 2100 });
        expect(pipe.transform({ year: 2026 })).toEqual({ year: 2026 });
    });

    it.each([
        ['1999', 'number.min', 'year deve ser maior ou igual a 2000'],
        ['2101', 'number.max', 'year deve ser menor ou igual a 2100'],
        ['2026.5', 'number.integer', 'year deve ser um número inteiro'],
        ['dois mil', 'number.base', 'year deve ser um número']
    ])('recusa o ano %s (%s)', (year, code, message) => {
        expect(validationDetails(() => pipe.transform({ year }))).toEqual([{ field: 'year', code, message }]);
    });

    it('ano é obrigatório e campos extras são recusados', () => {
        expect(validationDetails(() => pipe.transform({}))).toEqual([
            { field: 'year', code: 'any.required', message: 'year é obrigatório' }
        ]);
        expect(validationDetails(() => pipe.transform({ year: '2026', month: '2026-01' }))).toEqual([
            { field: 'month', code: 'object.unknown', message: 'month não é permitido' }
        ]);
    });
});
