import { C6CsvParser } from '../parsers/c6-csv.parser';
import { CardStatementFormatError, parseSignedAmountCents } from '../parsers/card-statement.parser';
import { NubankCsvParser } from '../parsers/nubank-csv.parser';

const MONTH = { year: 2026, month: 11 };

describe('parseSignedAmountCents', () => {
    it.each([
        ['66,38', ',', 6638n],
        ['"1.981,55"'.replace(/"/g, ''), ',', 198155n],
        ['- 1.981,55', ',', -198155n],
        ['88.15', '.', 8815n],
        ['-4094.96', '.', -409496n],
        ['0', '.', 0n],
        ['1,2,3', ',', null],
        ['abc', '.', null]
    ] as const)('converte %s', (raw, separator, expected) => {
        expect(parseSignedAmountCents(raw, separator)).toBe(expected);
    });
});

describe('NubankCsvParser', () => {
    const parser = new NubankCsvParser();

    it('lê compras, separa parcelas e ignora pagamentos', () => {
        const file = Buffer.from([
            'date,title,amount',
            '2026-11-03,Pagamento recebido,"- 1.981,55"',
            '2026-10-26,Loja Exemplo - Parcela 4/8,"66,38"',
            '2026-10-20,Padaria,"1.012,00"'
        ].join('\n'));
        const result = parser.parse({ file, month: MONTH });

        expect(result.ignoredCount).toBe(1);
        expect(result.transactions).toEqual([
            expect.objectContaining({ description: 'Loja Exemplo', amountCents: 6638n, installmentNumber: 4, installmentTotal: 8 }),
            expect.objectContaining({ description: 'Padaria', amountCents: 101200n, installmentNumber: null })
        ]);
    });

    it('recusa arquivos de outro banco', () => {
        const file = Buffer.from('Data de Compra;Descrição\n01/10/2026;Loja');

        expect(() => parser.parse({ file, month: MONTH })).toThrow(CardStatementFormatError);
    });
});

describe('C6CsvParser', () => {
    const parser = new C6CsvParser();
    const header = 'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)';

    it('lê titular, final do cartão e parcela, ignorando pagamentos e estornos', () => {
        const file = Buffer.from([
            header,
            '30/07/2026;FULANO DE TAL;1951;Serviços;MP *LOJA;3/4;0;0;88.15',
            '07/10/2026;FULANA;4256;Transporte;DL          *UBERRIDES;Única;0;0;8.93',
            '01/10/2026;FULANO DE TAL;4165;-;"Inclusao de Pagamento    ";Única;0;0;-4094.96',
            '20/10/2026;FULANO DE TAL;4165;-;Estorno Tarifa;Única;0;0;-50.00'
        ].join('\r\n'));
        const result = parser.parse({ file, month: MONTH });

        expect(result.ignoredCount).toBe(2);
        expect(result.transactions).toEqual([
            expect.objectContaining({
                transactionDate: '2026-07-30',
                description: 'MP *LOJA',
                holderName: 'FULANO DE TAL',
                cardLastDigits: '1951',
                installmentNumber: 3,
                installmentTotal: 4,
                amountCents: 8815n
            }),
            expect.objectContaining({ description: 'DL *UBERRIDES', installmentNumber: null, amountCents: 893n })
        ]);
    });

    it('aponta a linha com data inválida', () => {
        const file = Buffer.from(`${header}\n31/02/2026;FULANO;1951;-;Loja;Única;0;0;10.00`);

        expect(() => parser.parse({ file, month: MONTH })).toThrow('c6_invalid_date_line_2');
    });
});
