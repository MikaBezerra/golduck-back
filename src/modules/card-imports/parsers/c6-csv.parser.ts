import { Injectable } from '@nestjs/common';

import { CardBank } from '../../../generated/prisma/client.js';
import {
    CardStatementFormatError,
    CardStatementParseInput,
    CardStatementParser,
    CardStatementParseResult,
    normalizeDescription,
    ParsedCardTransaction,
    parseInstallment,
    parseSignedAmountCents,
    toIsoDate
} from './card-statement.parser.js';
import { readCsvRows } from './csv-rows.js';

const HEADER = [
    'Data de Compra',
    'Nome no Cartão',
    'Final do Cartão',
    'Categoria',
    'Descrição',
    'Parcela',
    'Valor (em US$)',
    'Cotação (em R$)',
    'Valor (em R$)'
];
const SINGLE_INSTALLMENT = 'Única';

/**
 * Formato exportado pelo app do C6 (separado por ponto e vírgula):
 *
 *   Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)
 *   30/07/2026;FULANO;1951;Serviços;MP *ALIEXPRESS;3/4;0;0;88.15
 *
 * A mesma fatura reúne todos os cartões físicos e virtuais da conta. Compras em
 * dólar já chegam convertidas em "Valor (em R$)". A categoria do banco é ignorada.
 */
@Injectable()
export class C6CsvParser implements CardStatementParser {
    public readonly bank = CardBank.C6;
    public readonly version = 'c6-csv@1';
    public readonly fileExtension = '.csv';

    public parse(input: CardStatementParseInput): CardStatementParseResult {
        const rows = readCsvRows(input.file, ';', HEADER);
        const transactions: ParsedCardTransaction[] = [];
        let ignoredCount = 0;

        rows.forEach((row, index) => {
            const line = index + 2;
            const [rawDate, rawHolder, rawLastDigits, , rawDescription, rawInstallment, , , rawAmount] = row.map(value => value.trim());
            const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
            const transactionDate = dateMatch
                ? toIsoDate(Number(dateMatch[3]), Number(dateMatch[2]), Number(dateMatch[1]))
                : null;

            if (!transactionDate) {
                throw new CardStatementFormatError(`c6_invalid_date_line_${line}`);
            }

            const amountCents = parseSignedAmountCents(rawAmount, '.');

            if (amountCents === null) {
                throw new CardStatementFormatError(`c6_invalid_amount_line_${line}`);
            }

            const description = normalizeDescription(rawDescription);

            if (!description) {
                throw new CardStatementFormatError(`c6_empty_description_line_${line}`);
            }

            const installment = rawInstallment === SINGLE_INSTALLMENT ? null : parseInstallment(rawInstallment);

            if (rawInstallment !== SINGLE_INSTALLMENT && !installment) {
                throw new CardStatementFormatError(`c6_invalid_installment_line_${line}`);
            }

            if (amountCents <= 0n) {
                ignoredCount++;
                return;
            }

            transactions.push({
                transactionDate,
                description,
                amountCents,
                installmentNumber: installment?.number ?? null,
                installmentTotal: installment?.total ?? null,
                holderName: normalizeDescription(rawHolder) || null,
                cardLastDigits: /^\d{4}$/.test(rawLastDigits) ? rawLastDigits : null
            });
        });

        return { transactions, ignoredCount };
    }
}
