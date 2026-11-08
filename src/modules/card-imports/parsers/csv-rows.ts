import { parse } from 'csv-parse/sync';

import { CardStatementFormatError } from './card-statement.parser.js';

/**
 * Lê o CSV inteiro e confere o cabeçalho. Devolve somente as linhas de dados,
 * todas com a mesma quantidade de colunas do cabeçalho.
 */
export function readCsvRows(file: Buffer, delimiter: string, expectedHeader: string[]): string[][] {
    let rows: string[][];

    try {
        rows = parse(file, {
            bom: true,
            delimiter,
            skip_empty_lines: true,
            relax_column_count: false
        });
    } catch {
        throw new CardStatementFormatError('csv_unreadable');
    }

    const [header, ...data] = rows;
    const normalizedHeader = header?.map(column => column.trim());

    if (
        !normalizedHeader
        || normalizedHeader.length !== expectedHeader.length
        || normalizedHeader.some((column, index) => column !== expectedHeader[index])
    ) {
        throw new CardStatementFormatError('csv_header_mismatch');
    }

    return data;
}
