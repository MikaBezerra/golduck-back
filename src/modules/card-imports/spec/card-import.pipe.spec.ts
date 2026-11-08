import type { ApiErrorDetail } from '../../common/http/response.types.js';

import { ValidationError } from '../../common/validation/validation-error.js';
import {
    CardImportExclusionsPipe,
    CardImportIdPipe,
    CardImportOverridesPipe,
    CreateCardImportPipe,
    CreateManualCardImportPipe,
    ListCardImportsPipe
} from '../flow/card-import.pipe.js';

/*
 * Validação (Joi) dos dados do upload, das escolhas da pré-visualização e da fatura digitada.
 * As rotas usam esses pipes; aqui ficam os limites, um a um (o que passa e o primeiro que não passa).
 */

const CARD_ID = '6d1f6c1e-3b8a-4c2d-9e7f-1a2b3c4d5e6f';
const CATEGORY_ID = '0b9d8c7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e';
const PERSON_ID = '5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b';

/** Os detalhes do ValidationError lançado (falha o teste se nada for lançado). */
function detailsOf(validate: () => unknown): ApiErrorDetail[] {
    try {
        validate();
    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            return error.details;
        }

        throw error;
    }

    throw new Error('era esperado um ValidationError');
}

describe('CreateCardImportPipe (campos do formulário do upload)', () => {
    const pipe = new CreateCardImportPipe();
    const valid = { cardId: CARD_ID, month: '2026-11' };

    it('aceita cartão e mês; senha, overrides e exclusions são opcionais e passam como texto', () => {
        expect(pipe.transform(valid)).toEqual(valid);
        expect(pipe.transform({ ...valid, password: 'x', overrides: '[]', exclusions: '[]' })).toEqual({
            ...valid, password: 'x', overrides: '[]', exclusions: '[]'
        });
    });

    it('exige cartão (UUID v4) e mês', () => {
        expect(detailsOf(() => pipe.transform({}))).toEqual([
            { field: 'cardId', code: 'any.required', message: 'cardId é obrigatório' },
            { field: 'month', code: 'any.required', message: 'month é obrigatório' }
        ]);
        // UUID de outra versão (1) não vale.
        expect(detailsOf(() => pipe.transform({ ...valid, cardId: '6d1f6c1e-3b8a-1c2d-9e7f-1a2b3c4d5e6f' }))).toEqual([
            { field: 'cardId', code: 'string.guid', message: 'cardId deve conter um UUID válido' }
        ]);
    });

    it.each(['2026-01', '2026-09', '2026-10', '2026-12', '1000-06', '9999-11'])('aceita o mês %s', month => {
        expect(pipe.transform({ ...valid, month })).toEqual({ ...valid, month });
    });

    it.each(['2026-00', '2026-13', '2026-1', '0999-01', '12026-01', '2026-011', 'x2026-01', '2026-01x', '2026/01', 'AAAA-MM'])(
        'recusa o mês %s com a mensagem do formato',
        month => {
            expect(detailsOf(() => pipe.transform({ ...valid, month }))).toEqual([
                { field: 'month', code: 'string.pattern.base', message: 'O mês deve estar no formato AAAA-MM' }
            ]);
        }
    );

    it('senha: de 1 a 100 caracteres', () => {
        expect(pipe.transform({ ...valid, password: 'x'.repeat(100) })).toMatchObject({ password: 'x'.repeat(100) });
        expect(detailsOf(() => pipe.transform({ ...valid, password: 'x'.repeat(101) }))).toEqual([
            { field: 'password', code: 'string.max', message: 'password deve ter no máximo 100 caracteres' }
        ]);
        expect(detailsOf(() => pipe.transform({ ...valid, password: '' }))).toEqual([
            expect.objectContaining({ field: 'password', code: 'string.empty' })
        ]);
    });

    it('recusa campos que o formulário não tem', () => {
        expect(detailsOf(() => pipe.transform({ ...valid, bank: 'NUBANK' }))).toEqual([
            { field: 'bank', code: 'object.unknown', message: 'bank não é permitido' }
        ]);
    });
});

describe('CardImportOverridesPipe (escolhas da pré-visualização, em JSON)', () => {
    const pipe = new CardImportOverridesPipe();
    const override = { key: 'S|2026-11-05|1000|LOJA', nickname: 'Mercado do mês', categoryId: CATEGORY_ID, personId: PERSON_ID };
    const transform = (value: unknown) => pipe.transform(JSON.stringify(value));

    it('converte o texto JSON na lista, tirando espaços do apelido', () => {
        expect(transform([{ ...override, nickname: '  Mercado do mês  ' }, { ...override, key: 'outra', nickname: null, personId: null }])).toEqual([
            override,
            { ...override, key: 'outra', nickname: null, personId: null }
        ]);
        expect(transform([])).toEqual([]);
    });

    it('texto que não é JSON: erro de validação no campo overrides', () => {
        expect(detailsOf(() => pipe.transform('[{"key":'))).toEqual([
            { field: 'overrides', code: 'json.invalid', message: 'overrides deve conter um JSON válido' }
        ]);
    });

    it('o JSON precisa ser uma lista', () => {
        expect(detailsOf(() => transform(override))).toEqual([
            { field: 'overrides', code: 'array.base', message: 'overrides deve ser uma lista' }
        ]);
    });

    it('todos os campos são obrigatórios (null é a forma de dizer "sem apelido" ou "compartilhada")', () => {
        expect(detailsOf(() => transform([{}])).map(detail => detail.field)).toEqual([
            'overrides[0].key',
            'overrides[0].nickname',
            'overrides[0].categoryId',
            'overrides[0].personId'
        ]);
    });

    it('limites: key até 400, apelido de 1 a 160 (sem contar espaços nas pontas), ids UUID e sem campos extras', () => {
        expect(transform([{ ...override, key: 'k'.repeat(400), nickname: 'n'.repeat(160) }])).toHaveLength(1);
        expect(detailsOf(() => transform([
            { ...override, key: 'k'.repeat(401) },
            { ...override, key: 'b', nickname: 'n'.repeat(161) },
            { ...override, key: 'c', nickname: '   ' },
            { ...override, key: 'd', categoryId: 'mercado', personId: '123' },
            { ...override, key: 'e', amount: '10.00' },
            { ...override, key: '' }
        ])).map(detail => [detail.field, detail.code])).toEqual([
            ['overrides[0].key', 'string.max'],
            ['overrides[1].nickname', 'string.max'],
            ['overrides[2].nickname', 'string.empty'],
            ['overrides[3].categoryId', 'string.guid'],
            ['overrides[3].personId', 'string.guid'],
            ['overrides[4].amount', 'object.unknown'],
            ['overrides[5].key', 'string.empty']
        ]);
    });

    it('até 500 escolhas, sem repetir a key', () => {
        const many = (count: number) => Array.from({ length: count }, (_, index) => ({ ...override, key: `k${index}` }));

        expect(transform(many(500))).toHaveLength(500);
        expect(detailsOf(() => transform(many(501)))).toEqual([
            { field: 'overrides', code: 'array.max', message: 'overrides deve conter no máximo 500 itens' }
        ]);
        expect(detailsOf(() => transform([override, { ...override, nickname: 'Outro' }]))).toEqual([
            expect.objectContaining({ field: 'overrides[1]', code: 'array.unique' })
        ]);
    });
});

describe('CardImportExclusionsPipe (decisões de excluir/restaurar, em JSON)', () => {
    const pipe = new CardImportExclusionsPipe();
    const exclusion = { key: 'P|2026-09|8|LOJA', action: 'exclude', scope: 'all', remember: true };
    const transform = (value: unknown) => pipe.transform(JSON.stringify(value));

    it('converte o texto JSON; remember é falso quando não vem', () => {
        expect(transform([exclusion, { key: 'outra', action: 'restore', scope: 'month' }])).toEqual([
            exclusion,
            { key: 'outra', action: 'restore', scope: 'month', remember: false }
        ]);
    });

    it.each(['month', 'forward', 'backward', 'all'])('aceita o escopo %s', scope => {
        expect(transform([{ ...exclusion, scope }])).toEqual([{ ...exclusion, scope }]);
    });

    it('texto que não é JSON: erro de validação no campo exclusions', () => {
        expect(detailsOf(() => pipe.transform('excluir tudo'))).toEqual([
            { field: 'exclusions', code: 'json.invalid', message: 'exclusions deve conter um JSON válido' }
        ]);
    });

    it('recusa ação, escopo e remember inválidos, campos faltando ou extras', () => {
        expect(detailsOf(() => transform([
            { ...exclusion, action: 'delete' },
            { ...exclusion, key: 'b', scope: 'year' },
            { ...exclusion, key: 'c', remember: 'sim' },
            { key: 'd' },
            { ...exclusion, key: 'e', personId: null },
            { ...exclusion, key: 'k'.repeat(401) }
        ])).map(detail => [detail.field, detail.code])).toEqual([
            ['exclusions[0].action', 'any.only'],
            ['exclusions[1].scope', 'any.only'],
            ['exclusions[2].remember', 'boolean.base'],
            ['exclusions[3].action', 'any.required'],
            ['exclusions[3].scope', 'any.required'],
            ['exclusions[4].personId', 'object.unknown'],
            ['exclusions[5].key', 'string.max']
        ]);
        expect(transform([{ ...exclusion, key: 'k'.repeat(400) }])).toHaveLength(1);
    });

    it('até 500 decisões, sem repetir a key', () => {
        const many = (count: number) => Array.from({ length: count }, (_, index) => ({ ...exclusion, key: `k${index}` }));

        expect(transform(many(500))).toHaveLength(500);
        expect(detailsOf(() => transform(many(501)))).toEqual([
            { field: 'exclusions', code: 'array.max', message: 'exclusions deve conter no máximo 500 itens' }
        ]);
        expect(detailsOf(() => transform([exclusion, { ...exclusion, action: 'restore' }]))).toEqual([
            expect.objectContaining({ field: 'exclusions[1]', code: 'array.unique' })
        ]);
    });
});

describe('CreateManualCardImportPipe (fatura digitada)', () => {
    const pipe = new CreateManualCardImportPipe();
    const transaction = { date: '2026-10-18', description: 'AMAZON BR', amount: '100.00' };
    const body = (...transactions: unknown[]) => ({ cardId: CARD_ID, month: '2026-11', transactions });
    const fieldErrors = (...transactions: unknown[]) =>
        detailsOf(() => pipe.transform(body(...transactions))).map(detail => [detail.field, detail.code, detail.message]);

    it('aceita lançamentos à vista e parcelados, tirando espaços da descrição', () => {
        const parsed = pipe.transform(body(
            { ...transaction, description: '  AMAZON BR  ' },
            { ...transaction, installment: { number: 2, total: 10 }, cardLastDigits: '0192' },
            { ...transaction, installment: null, cardLastDigits: null }
        ));

        expect(parsed).toEqual(body(
            transaction,
            { ...transaction, installment: { number: 2, total: 10 }, cardLastDigits: '0192' },
            { ...transaction, installment: null, cardLastDigits: null }
        ));
        // Lista vazia é válida: a fatura do mês não tem lançamentos.
        expect(pipe.transform(body())).toEqual(body());
    });

    it('exige cartão, mês e a lista; recusa campos extras', () => {
        expect(detailsOf(() => pipe.transform({ total: '10.00' })).map(detail => [detail.field, detail.code])).toEqual([
            ['cardId', 'any.required'],
            ['month', 'any.required'],
            ['transactions', 'any.required'],
            ['total', 'object.unknown']
        ]);
        expect(fieldErrors({ ...transaction, category: 'x' })).toEqual([
            ['transactions[0].category', 'object.unknown', 'transactions[0].category não é permitido']
        ]);
        expect(fieldErrors({}).map(([field]) => field)).toEqual([
            'transactions[0].date',
            'transactions[0].description',
            'transactions[0].amount'
        ]);
    });

    it('data: AAAA-MM-DD de um dia que existe', () => {
        expect(pipe.transform(body({ ...transaction, date: '2024-02-29' }))).toMatchObject(body({ ...transaction, date: '2024-02-29' }));

        // Fora do formato, a conferência do dia também falha: o cliente recebe as duas mensagens.
        for (const date of ['18/10/2026', '2026-10-1', '2026-10-180', 'x2026-10-18', '2026-10-18x']) {
            expect(fieldErrors({ ...transaction, date })).toEqual([
                ['transactions[0].date', 'string.pattern.base', 'A data deve estar no formato AAAA-MM-DD'],
                ['transactions[0].date', 'any.invalid', 'A data informada não existe']
            ]);
        }

        for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-04-31', '2026-10-00']) {
            expect(fieldErrors({ ...transaction, date })).toEqual([
                ['transactions[0].date', 'any.invalid', 'A data informada não existe']
            ]);
        }
    });

    it('descrição: de 1 a 200 caracteres sem contar espaços nas pontas', () => {
        expect(pipe.transform(body({ ...transaction, description: `  ${'d'.repeat(200)}  ` }))).toMatchObject(
            body({ ...transaction, description: 'd'.repeat(200) })
        );
        expect(fieldErrors({ ...transaction, description: 'd'.repeat(201) })).toEqual([
            ['transactions[0].description', 'string.max', 'transactions[0].description deve ter no máximo 200 caracteres']
        ]);
        expect(fieldErrors({ ...transaction, description: '   ' })).toEqual([
            ['transactions[0].description', 'string.empty', 'transactions[0].description não pode estar vazio']
        ]);
    });

    it('valor: reais com até 2 casas, ponto decimal e no máximo 20 caracteres', () => {
        for (const amount of ['0', '1', '100.5', '100.55', '12345678901234567.00']) {
            expect(pipe.transform(body({ ...transaction, amount }))).toMatchObject(body({ ...transaction, amount }));
        }

        for (const amount of ['01.00', '100.555', '1,00', '-1.00', '.50', '100.', 'R$ 10', 'x100', '100x']) {
            expect(fieldErrors({ ...transaction, amount })).toEqual([
                ['transactions[0].amount', 'string.pattern.base', 'O valor deve estar em reais, por exemplo 100.00']
            ]);
        }

        expect(fieldErrors({ ...transaction, amount: '123456789012345678.00' })).toEqual([
            ['transactions[0].amount', 'string.max', 'transactions[0].amount deve ter no máximo 20 caracteres']
        ]);
    });

    it('parcela: número e total de 1 a 99, número não maior que o total', () => {
        const withInstallment = (installment: unknown) => ({ ...transaction, installment });

        expect(pipe.transform(body(withInstallment({ number: 99, total: 99 })))).toMatchObject(body(withInstallment({ number: 99, total: 99 })));
        expect(pipe.transform(body(withInstallment({ number: 1, total: 1 })))).toMatchObject(body(withInstallment({ number: 1, total: 1 })));
        expect(fieldErrors(withInstallment({ number: 5, total: 4 }))).toEqual([
            ['transactions[0].installment.number', 'number.max', 'A parcela não pode ser maior que o total de parcelas']
        ]);
        expect(fieldErrors(withInstallment({ number: 0, total: 100 })).map(([field, code]) => [field, code])).toEqual([
            ['transactions[0].installment.total', 'number.max'],
            ['transactions[0].installment.number', 'number.min']
        ]);
        expect(fieldErrors(withInstallment({ number: 1.5, total: 2 })).map(([field, code]) => [field, code])).toEqual([
            ['transactions[0].installment.number', 'number.integer']
        ]);
        expect(fieldErrors(withInstallment({ number: 1 })).map(([field, code]) => [field, code])).toEqual([
            ['transactions[0].installment.total', 'any.required'],
            ['transactions[0].installment.number', 'any.ref']
        ]);
    });

    it('final do cartão: exatamente 4 dígitos', () => {
        for (const cardLastDigits of ['123', '12345', 'a123', '12 3']) {
            expect(fieldErrors({ ...transaction, cardLastDigits })).toEqual([
                ['transactions[0].cardLastDigits', 'string.pattern.base', 'O final do cartão deve ter 4 dígitos']
            ]);
        }
    });

    it('até 500 lançamentos', () => {
        expect((pipe.transform(body(...Array.from({ length: 500 }, () => transaction))) as { transactions: unknown[] }).transactions).toHaveLength(500);
        expect(fieldErrors(...Array.from({ length: 501 }, () => transaction))).toEqual([
            ['transactions', 'array.max', 'transactions deve conter no máximo 500 itens']
        ]);
    });
});

describe('ListCardImportsPipe e CardImportIdPipe', () => {
    it('filtros opcionais por cartão e mês, nada além disso', () => {
        const pipe = new ListCardImportsPipe();

        expect(pipe.transform({})).toEqual({});
        expect(pipe.transform({ cardId: CARD_ID, month: '2026-11' })).toEqual({ cardId: CARD_ID, month: '2026-11' });
        expect(detailsOf(() => pipe.transform({ cardId: 'x', month: '2026-13', page: '1' })).map(detail => [detail.field, detail.code])).toEqual([
            ['cardId', 'string.guid'],
            ['month', 'string.pattern.base'],
            ['page', 'object.unknown']
        ]);
    });

    it('o id da rota é um UUID v4', () => {
        const pipe = new CardImportIdPipe();

        expect(pipe.transform(CARD_ID)).toBe(CARD_ID);
        expect(detailsOf(() => pipe.transform('123'))).toEqual([
            { field: '$', code: 'string.guid', message: 'id deve conter um UUID válido' }
        ]);
    });
});
