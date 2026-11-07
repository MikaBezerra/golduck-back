import { CardBank } from '../../../generated/prisma/client';
import {
    CardStatementFormatError,
    CardStatementParseInput,
    CardStatementParser,
    CardStatementParseResult,
    CardStatementPasswordError,
    normalizeDescription,
    ParsedCardTransaction,
    parseInstallment,
    parseSignedAmountCents,
    StatementMonth,
    toIsoDate
} from './card-statement.parser';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

const HEADER = ['Data', 'Descrição', 'Parcela', 'Cartão', 'Valores em US$', 'Valores em R$'];
const SECTION_END = '*';
const ROW_DATE = /^(\d{2})\/(\d{2})$/;
const CARD = /^(?:Virtual|F[íi]sico) - (\d{4})$/;
const NO_VALUE = '-';
const PASSWORD_REQUIRED = 1;

/**
 * Fatura em PDF enviada pelo Neon (normalmente protegida por senha). Lê somente
 * a tabela "Lançamentos" (inclusive quando continua em outra página), em que
 * cada linha tem as células:
 *
 *   Data | Descrição | Parcela | Cartão | Valores em US$ | Valores em R$
 *   08/08 | AMAZONMKTPLC*BAURBAURU BR 3/10 | 03/10 | Virtual - 0192 | - | 98,45
 *   01/10 | Pagamento Fatura | - | - | - | - 792,94
 *
 * A data não traz o ano; ele é deduzido a partir do mês da fatura.
 */
export class NeonPdfParser implements CardStatementParser {
    public readonly bank = CardBank.NEON;
    public readonly version = 'neon-pdf@1';
    public readonly fileExtension = '.pdf';

    public async parse(input: CardStatementParseInput): Promise<CardStatementParseResult> {
        const rows = await this.readRows(input.file, input.password);
        const transactions: ParsedCardTransaction[] = [];
        let ignoredCount = 0;
        let insideTable = false;
        let foundTable = false;

        for (const row of rows) {
            if (this.isHeader(row)) {
                insideTable = true;
                foundTable = true;
            } else if (insideTable && row[0]?.startsWith(SECTION_END)) {
                insideTable = false;
            } else if (insideTable && ROW_DATE.test(row[0] ?? '')) {
                const transaction = this.parseRow(row, input.month, transactions.length + ignoredCount + 1);

                if (transaction) {
                    transactions.push(transaction);
                } else {
                    ignoredCount++;
                }
            }
        }

        if (!foundTable) {
            throw new CardStatementFormatError('neon_table_not_found');
        }

        return { transactions, ignoredCount };
    }

    private parseRow(row: string[], month: StatementMonth, position: number): ParsedCardTransaction | null {
        if (row.length !== HEADER.length) {
            throw new CardStatementFormatError(`neon_unexpected_columns_row_${position}`);
        }

        const [rawDate, rawDescription, rawInstallment, rawCard, , rawAmount] = row;
        const amountCents = parseSignedAmountCents(rawAmount, ',');

        if (amountCents === null) {
            throw new CardStatementFormatError(`neon_invalid_amount_row_${position}`);
        }

        if (amountCents <= 0n) {
            return null;
        }

        const transactionDate = this.toTransactionDate(rawDate, month);

        if (!transactionDate) {
            throw new CardStatementFormatError(`neon_invalid_date_row_${position}`);
        }

        const installment = rawInstallment === NO_VALUE ? null : parseInstallment(rawInstallment);

        if (rawInstallment !== NO_VALUE && !installment) {
            throw new CardStatementFormatError(`neon_invalid_installment_row_${position}`);
        }

        const card = CARD.exec(rawCard);

        if (rawCard !== NO_VALUE && !card) {
            throw new CardStatementFormatError(`neon_invalid_card_row_${position}`);
        }

        // A descrição repete a parcela no final ("LOJA 3/10"); ela já vem na própria coluna.
        const description = normalizeDescription(
            installment ? rawDescription.replace(/\s+\d{1,2}\/\d{1,2}$/, '') : rawDescription
        );

        if (!description) {
            throw new CardStatementFormatError(`neon_empty_description_row_${position}`);
        }

        return {
            transactionDate,
            description,
            amountCents,
            installmentNumber: installment?.number ?? null,
            installmentTotal: installment?.total ?? null,
            holderName: null,
            cardLastDigits: card ? card[1] : null
        };
    }

    /** Compras com mês maior que o da fatura pertencem ao ano anterior. */
    private toTransactionDate(raw: string, month: StatementMonth): string | null {
        const match = ROW_DATE.exec(raw);

        if (!match) {
            return null;
        }

        const day = Number(match[1]);
        const purchaseMonth = Number(match[2]);
        const year = purchaseMonth > month.month ? month.year - 1 : month.year;

        return toIsoDate(year, purchaseMonth, day);
    }

    private isHeader(row: string[]): boolean {
        return row.length === HEADER.length && row.every((cell, index) => cell === HEADER[index]);
    }

    /** Extrai o texto do PDF em linhas, cada uma como lista de células não vazias. */
    private async readRows(file: Buffer, password?: string): Promise<string[][]> {
        const pdfjs = await this.loadPdfJs();
        const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(file),
            password,
            verbosity: pdfjs.VerbosityLevel.ERRORS,
            stopAtErrors: true
        });

        try {
            const document = await loadingTask.promise;
            const rows: string[][] = [];

            for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
                const page = await document.getPage(pageNumber);
                const content = await page.getTextContent();
                let cells: string[] = [];

                for (const item of content.items) {
                    if (!('str' in item)) {
                        continue;
                    }

                    const text = item.str.trim();

                    if (text) {
                        cells.push(text);
                    }

                    if (item.hasEOL && cells.length > 0) {
                        rows.push(cells);
                        cells = [];
                    }
                }

                if (cells.length > 0) {
                    rows.push(cells);
                }
            }

            return rows;
        } catch (error: unknown) {
            if (error instanceof pdfjs.PasswordException) {
                throw new CardStatementPasswordError(
                    error.code === PASSWORD_REQUIRED ? 'pdf_password_required' : 'pdf_password_incorrect'
                );
            }

            throw new CardStatementFormatError('pdf_unreadable');
        } finally {
            await loadingTask.destroy();
        }
    }

    private async loadPdfJs(): Promise<PdfJs> {
        return import('pdfjs-dist/legacy/build/pdf.mjs');
    }
}
