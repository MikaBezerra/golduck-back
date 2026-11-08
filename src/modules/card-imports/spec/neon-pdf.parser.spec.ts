import type { PdfPage } from './neon-pdf.fixture.js';

import { CardBank } from '../../../generated/prisma/client.js';
import { CardStatementFormatError, CardStatementPasswordError } from '../parsers/card-statement.parser.js';
import { NeonPdfParser } from '../parsers/neon-pdf.parser.js';
import { buildNeonPdf, NEON_HEADER } from './neon-pdf.fixture.js';

/*
 * Fatura do Neon em PDF, lida pelo pdf.js de verdade. Os PDFs são gerados no próprio teste
 * (neon-pdf.fixture.ts) com o mesmo layout da fatura: a tabela "Lançamentos", com uma célula
 * por trecho de texto, podendo continuar na página seguinte.
 */
describe('NeonPdfParser', () => {
    const parser = new NeonPdfParser();
    const november = { year: 2026, month: 11 };

    /** Uma página com o cabeçalho da tabela e as linhas informadas. */
    const table = (...rows: string[][]): PdfPage => [NEON_HEADER, ...rows];

    const parse = async (pages: PdfPage[], options: { password?: string; filePassword?: string } = {}) =>
        parser.parse({
            file: buildNeonPdf(pages, { password: options.filePassword }),
            month: november,
            password: options.password
        });

    const expectFormatError = async (pages: PdfPage[], reason: string): Promise<void> => {
        const parsing = parse(pages);

        await expect(parsing).rejects.toBeInstanceOf(CardStatementFormatError);
        await expect(parsing).rejects.toMatchObject({ reason });
    };

    it('identifica o banco, a versão e a extensão aceita', () => {
        expect(parser.bank).toBe(CardBank.NEON);
        expect(parser.version).toBe('neon-pdf@1');
        expect(parser.fileExtension).toBe('.pdf');
    });

    it('lê a tabela de lançamentos em várias páginas, ignorando o que está fora dela', async () => {
        const result = await parse([
            [
                ['Fatura Neon'],
                // Antes do cabeçalho: não é lançamento, mesmo começando com data.
                ['10/11', 'Vencimento'],
                NEON_HEADER,
                ['08/08', 'AMAZON MKTPLC 3/10', '03/10', 'Virtual - 0192', '-', '98,45'],
                ['01/10', 'Pagamento Fatura', '-', '-', '-', '- 792,94'],
                ['15/12', 'HOTEL EXTERIOR', '-', 'Físico - 1234', '50,00', '1.234,56'],
                // Linhas soltas dentro da tabela que não começam com data dd/mm: são puladas.
                ['Subtotal em 10/11'],
                ['10/11/2026'],
                ['1/11'],
                ['11/1'],
                ['05/11', 'CURSO 1/2 SEMESTRE 2/12', '02/12', 'Fisico - 5678', '-', '10,00'],
                ['20/10', 'Estorno', '-', '-', '-', '0,00'],
                // A última linha da página não tem quebra de linha depois dela.
                ['21/10', 'PADARIA 1/2', '-', '-', '-', '7,50']
            ],
            [
                NEON_HEADER,
                ['30/11', 'MERCADO', '-', 'Virtual - 0192', '-', '45,00'],
                ['* Lançamentos em dólar convertidos pela cotação do dia'],
                // Depois do fim da tabela ("*"): não é lançamento.
                ['25/11', 'Encargos', '-', '-', '-', '9,99']
            ]
        ]);

        expect(result.ignoredCount).toBe(2);
        expect(result.transactions).toEqual([
            {
                transactionDate: '2026-08-08',
                description: 'AMAZON MKTPLC',
                amountCents: 9845n,
                installmentNumber: 3,
                installmentTotal: 10,
                holderName: null,
                cardLastDigits: '0192'
            },
            {
                // Mês da compra depois do mês da fatura: é do ano anterior.
                transactionDate: '2025-12-15',
                description: 'HOTEL EXTERIOR',
                amountCents: 123456n,
                installmentNumber: null,
                installmentTotal: null,
                holderName: null,
                cardLastDigits: '1234'
            },
            {
                // Mesmo mês da fatura: mesmo ano. Só a parcela do final sai da descrição.
                transactionDate: '2026-11-05',
                description: 'CURSO 1/2 SEMESTRE',
                amountCents: 1000n,
                installmentNumber: 2,
                installmentTotal: 12,
                holderName: null,
                cardLastDigits: '5678'
            },
            {
                // Sem parcela na coluna, o "1/2" faz parte do nome.
                transactionDate: '2026-10-21',
                description: 'PADARIA 1/2',
                amountCents: 750n,
                installmentNumber: null,
                installmentTotal: null,
                holderName: null,
                cardLastDigits: null
            },
            {
                transactionDate: '2026-11-30',
                description: 'MERCADO',
                amountCents: 4500n,
                installmentNumber: null,
                installmentTotal: null,
                holderName: null,
                cardLastDigits: '0192'
            }
        ]);
    });

    it('fatura de janeiro: compras de dezembro são do ano anterior', async () => {
        const result = await parser.parse({
            file: buildNeonPdf([table(
                ['28/12', 'PRESENTE', '-', '-', '-', '100,00'],
                ['02/01', 'FARMACIA', '-', '-', '-', '20,00']
            )]),
            month: { year: 2027, month: 1 }
        });

        expect(result.transactions.map(transaction => transaction.transactionDate)).toEqual(['2026-12-28', '2027-01-02']);
    });

    it('tabela sem lançamentos não é erro: devolve a lista vazia', async () => {
        await expect(parse([table()])).resolves.toEqual({ transactions: [], ignoredCount: 0 });
    });

    it('sem a tabela de lançamentos, o arquivo não é uma fatura do Neon', async () => {
        await expectFormatError([[['Extrato da conta'], ['08/08', 'LOJA', '-', '-', '-', '98,45']]], 'neon_table_not_found');
        // Cabeçalho parecido, mas com outra coluna, também não vale.
        await expectFormatError(
            [[['Data', 'Descrição', 'Parcela', 'Cartão', 'Valores em US$', 'Valor'], ['08/08', 'LOJA', '-', '-', '-', '98,45']]],
            'neon_table_not_found'
        );
    });

    it('linha com colunas a mais ou a menos é recusada, com a posição da linha', async () => {
        await expectFormatError([table(['08/08', 'LOJA', '-', '-', '98,45'])], 'neon_unexpected_columns_row_1');
        await expectFormatError([table(['08/08', 'LOJA', '-', '-', '-', '98,45', 'extra'])], 'neon_unexpected_columns_row_1');
    });

    it('a posição conta as linhas lidas e as ignoradas', async () => {
        await expectFormatError([table(
            ['08/08', 'LOJA', '-', '-', '-', '98,45'],
            ['01/10', 'Pagamento Fatura', '-', '-', '-', '- 792,94'],
            ['09/08', 'LOJA', '-', '-', '-', 'abc']
        )], 'neon_invalid_amount_row_3');
    });

    it('recusa valor, data, parcela e cartão inválidos', async () => {
        await expectFormatError([table(['08/08', 'LOJA', '-', '-', '-', '98.45.1'])], 'neon_invalid_amount_row_1');
        await expectFormatError([table(['31/02', 'LOJA', '-', '-', '-', '98,45'])], 'neon_invalid_date_row_1');
        await expectFormatError([table(['08/08', 'LOJA 11/10', '11/10', '-', '-', '98,45'])], 'neon_invalid_installment_row_1');
        await expectFormatError([table(['08/08', 'LOJA', 'à vista', '-', '-', '98,45'])], 'neon_invalid_installment_row_1');

        for (const card of ['Adicional - 0192', 'Virtual - 01923', 'Virtual - 192', 'Meu Virtual - 0192', 'Virtual 0192']) {
            await expectFormatError([table(['08/08', 'LOJA', '-', card, '-', '98,45'])], 'neon_invalid_card_row_1');
        }
    });

    it('PDF protegido: sem senha pede a senha, senha errada é recusada e a certa lê a fatura', async () => {
        const pages = [table(['08/08', 'LOJA', '-', '-', '-', '98,45'])];

        const withoutPassword = parse(pages, { filePassword: '12345678900' });
        const wrongPassword = parse(pages, { filePassword: '12345678900', password: '00000000000' });

        await expect(withoutPassword).rejects.toBeInstanceOf(CardStatementPasswordError);
        await expect(withoutPassword).rejects.toMatchObject({ reason: 'pdf_password_required' });
        await expect(wrongPassword).rejects.toBeInstanceOf(CardStatementPasswordError);
        await expect(wrongPassword).rejects.toMatchObject({ reason: 'pdf_password_incorrect' });
        await expect(parse(pages, { filePassword: '12345678900', password: '12345678900' })).resolves.toMatchObject({
            transactions: [{ description: 'LOJA', amountCents: 9845n }]
        });
    });

    it('PDF com conteúdo corrompido é recusado inteiro, sem ler só uma parte', async () => {
        const parsing = parser.parse({
            file: buildNeonPdf([table(['08/08', 'LOJA', '-', '-', '-', '98,45'])], { brokenContent: true }),
            month: november
        });

        await expect(parsing).rejects.toBeInstanceOf(CardStatementFormatError);
        await expect(parsing).rejects.toMatchObject({ reason: 'pdf_unreadable' });
    });
});
