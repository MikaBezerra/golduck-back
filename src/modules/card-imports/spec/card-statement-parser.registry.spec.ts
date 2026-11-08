import { Test } from '@nestjs/testing';

import { CardBank } from '../../../generated/prisma/client.js';
import { C6CsvParser } from '../parsers/c6-csv.parser.js';
import { CARD_STATEMENT_PARSERS, CardStatementParserRegistry } from '../parsers/card-statement-parser.registry.js';
import { CardStatementFormatError } from '../parsers/card-statement.parser.js';
import { NeonPdfParser } from '../parsers/neon-pdf.parser.js';
import { NubankCsvParser } from '../parsers/nubank-csv.parser.js';

describe('CardStatementParserRegistry', () => {
    let registry: CardStatementParserRegistry;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [...CARD_STATEMENT_PARSERS]
        }).compile();

        registry = moduleRef.get(CardStatementParserRegistry);
    });

    it('resolve, pela injeção do Nest, um parser para cada banco', () => {
        expect(registry.get(CardBank.NUBANK)).toBeInstanceOf(NubankCsvParser);
        expect(registry.get(CardBank.C6)).toBeInstanceOf(C6CsvParser);
        expect(registry.get(CardBank.NEON)).toBeInstanceOf(NeonPdfParser);
    });

    it('carrega o leitor de PDF e recusa um arquivo que não é PDF', async () => {
        const parser = registry.get(CardBank.NEON);
        const parsing = parser.parse({
            file: Buffer.from('date,title,amount\n'),
            month: { year: 2026, month: 11 }
        });

        await expect(parsing).rejects.toBeInstanceOf(CardStatementFormatError);
        await expect(parsing).rejects.toMatchObject({ reason: 'pdf_unreadable' });
    });
});
