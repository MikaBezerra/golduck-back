import type { CardStatementParser } from './card-statement.parser.js';
import type { CardBank } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { C6CsvParser } from './c6-csv.parser.js';
import { NeonPdfParser } from './neon-pdf.parser.js';
import { NubankCsvParser } from './nubank-csv.parser.js';

/** Escolhe o parser de fatura de acordo com o banco do cartão. */
@Injectable()
export class CardStatementParserRegistry {
    private readonly parsers: ReadonlyMap<CardBank, CardStatementParser>;

    public constructor(nubank: NubankCsvParser, c6: C6CsvParser, neon: NeonPdfParser) {
        this.parsers = new Map<CardBank, CardStatementParser>(
            [nubank, c6, neon].map(parser => [parser.bank, parser])
        );
    }

    public get(bank: CardBank): CardStatementParser {
        const parser = this.parsers.get(bank);

        if (!parser) {
            throw new Error(`Nenhum parser de fatura registrado para o banco ${bank}`);
        }

        return parser;
    }
}

export const CARD_STATEMENT_PARSERS = [NubankCsvParser, C6CsvParser, NeonPdfParser, CardStatementParserRegistry];
