import { CardBank } from '../../../generated/prisma/client';
import {
    CardStatementFormatError,
    CardStatementParseInput,
    CardStatementParser,
    CardStatementParseResult,
    normalizeDescription,
    ParsedCardTransaction,
    parseInstallment,
    parseSignedAmountCents
} from './card-statement.parser';
import { readCsvRows } from './csv-rows';

const HEADER = ['date', 'title', 'amount'];
const INSTALLMENT_SUFFIX = /^(.*\S)\s+-\s+Parcela\s+(\d{1,2}\/\d{1,2})$/;

/**
 * Formato exportado pelo app do Nubank:
 *
 *   date,title,amount
 *   2026-10-26,Ferreira Costa - Parcela 4/8,"66,38"
 *   2026-11-03,Pagamento recebido,"- 1.981,55"
 *
 * Nas parcelas, a data é a do lançamento na fatura, não a da compra.
 */
export class NubankCsvParser implements CardStatementParser {
    public readonly bank = CardBank.NUBANK;
    public readonly version = 'nubank-csv@1';
    public readonly fileExtension = '.csv';

    public parse(input: CardStatementParseInput): CardStatementParseResult {
        const rows = readCsvRows(input.file, ',', HEADER);
        const transactions: ParsedCardTransaction[] = [];
        let ignoredCount = 0;

        rows.forEach((row, index) => {
            const line = index + 2;
            const [rawDate, rawTitle, rawAmount] = row.map(value => value.trim());

            if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(`${rawDate}T00:00:00Z`))) {
                throw new CardStatementFormatError(`nubank_invalid_date_line_${line}`);
            }

            const amountCents = parseSignedAmountCents(rawAmount, ',');

            if (amountCents === null) {
                throw new CardStatementFormatError(`nubank_invalid_amount_line_${line}`);
            }

            if (!rawTitle) {
                throw new CardStatementFormatError(`nubank_empty_title_line_${line}`);
            }

            if (amountCents <= 0n) {
                ignoredCount++;
                return;
            }

            const installmentMatch = INSTALLMENT_SUFFIX.exec(rawTitle);
            const installment = installmentMatch ? parseInstallment(installmentMatch[2]) : null;

            if (installmentMatch && !installment) {
                throw new CardStatementFormatError(`nubank_invalid_installment_line_${line}`);
            }

            transactions.push({
                transactionDate: rawDate,
                description: normalizeDescription(installmentMatch ? installmentMatch[1] : rawTitle),
                amountCents,
                installmentNumber: installment?.number ?? null,
                installmentTotal: installment?.total ?? null,
                holderName: null,
                cardLastDigits: null
            });
        });

        return { transactions, ignoredCount };
    }
}
