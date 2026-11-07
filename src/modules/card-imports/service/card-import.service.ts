import type { CreditCard } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { extname } from 'path';

import { CategoryService } from '../../categories/service/category.service';
import { formatMonth, parseMonth } from '../../common/date/month';
import { parsePositiveAmountCents } from '../../common/money/money';
import { CreditCardService } from '../../credit-cards/service/credit-card.service';
import {
    CardImportResponse,
    CardImportResultResponse,
    CreateCardImportDto,
    CreateManualCardImportDto,
    ListCardImportsDto
} from '../dto/card-import.dto';
import { CARD_IMPORT_ERRORS } from '../errors/card-import.errors';
import { CardStatementParserRegistry } from '../parsers/card-statement-parser.registry';
import {
    CardStatementFormatError,
    CardStatementParseResult,
    CardStatementParser,
    CardStatementParseInput,
    normalizeDescription,
    ParsedCardTransaction
} from '../parsers/card-statement.parser';
import { CardImportRepository, CardImportWithCount } from '../repository/card-import.repository';
import { assignPurchaseKeys, planCardImport } from './card-import.planner';

export type UploadedStatementFile = {
    fileName: string;
    content: Buffer;
};

type ImportSource = {
    fileName: string;
    fileHash: string;
    parserVersion: string;
};

const MAX_FILE_NAME_LENGTH = 255;
const MANUAL_FILE_NAME = 'Lançamento manual';
const MANUAL_VERSION = 'manual@1';

@Injectable()
export class CardImportService {
    public constructor(
        private readonly cardImportRepository: CardImportRepository,
        private readonly creditCardService: CreditCardService,
        private readonly categoryService: CategoryService,
        private readonly parsers: CardStatementParserRegistry
    ) { }

    /** Upload do arquivo exportado pelo banco do cartão. */
    public async create(data: CreateCardImportDto, file: UploadedStatementFile): Promise<CardImportResultResponse> {
        const card = await this.creditCardService.getActiveById(data.cardId);
        const parser = this.parsers.get(card.bank);

        if (extname(file.fileName).toLowerCase() !== parser.fileExtension) {
            throw CARD_IMPORT_ERRORS.invalidFileType(`expected_${parser.fileExtension.slice(1)}_for_${card.bank.toLowerCase()}`);
        }

        const month = parseMonth(data.month);
        const parsed = await this.parse(parser, {
            file: file.content,
            month: { year: month.getUTCFullYear(), month: month.getUTCMonth() + 1 },
            password: data.password
        });

        return this.applyImport(card, month, parsed, {
            fileName: file.fileName.slice(0, MAX_FILE_NAME_LENGTH),
            fileHash: this.hash(file.content),
            parserVersion: parser.version
        });
    }

    /**
     * Fatura digitada pelo usuário, para bancos sem arquivo compatível. Segue as
     * mesmas regras do upload: é absoluta para o mês e pode ser excluída depois.
     */
    public async createManual(data: CreateManualCardImportDto): Promise<CardImportResultResponse> {
        const card = await this.creditCardService.getActiveById(data.cardId);
        const transactions = data.transactions.map((transaction, index): ParsedCardTransaction => {
            const amountCents = parsePositiveAmountCents(transaction.amount);

            if (amountCents === null) {
                throw CARD_IMPORT_ERRORS.invalidManualAmount(`transactions[${index}].amount`);
            }

            return {
                transactionDate: transaction.date,
                description: normalizeDescription(transaction.description),
                amountCents,
                installmentNumber: transaction.installment?.number ?? null,
                installmentTotal: transaction.installment?.total ?? null,
                holderName: null,
                cardLastDigits: transaction.cardLastDigits ?? null
            };
        });

        return this.applyImport(card, parseMonth(data.month), { transactions, ignoredCount: 0 }, {
            fileName: MANUAL_FILE_NAME,
            fileHash: this.hash(Buffer.from(JSON.stringify(data.transactions))),
            parserVersion: MANUAL_VERSION
        });
    }

    public async findAll(query: ListCardImportsDto): Promise<CardImportResponse[]> {
        const imports = await this.cardImportRepository.findAll({
            cardId: query.cardId,
            month: query.month === undefined ? undefined : parseMonth(query.month)
        });

        return imports.map(cardImport => this.toResponse(cardImport));
    }

    public async findById(id: string): Promise<CardImportResponse> {
        return this.toResponse(await this.getById(id));
    }

    public async delete(id: string): Promise<void> {
        await this.getById(id);
        await this.cardImportRepository.delete(id);
    }

    private async applyImport(
        card: CreditCard,
        month: Date,
        parsed: CardStatementParseResult,
        source: ImportSource
    ): Promise<CardImportResultResponse> {
        const transactions = assignPurchaseKeys(parsed.transactions, month);
        const defaultCategory = await this.categoryService.findDefault();
        const { cardImport, plan } = await this.cardImportRepository.apply({
            data: {
                ...source,
                cardId: card.id,
                month,
                rowCount: transactions.length,
                ignoredCount: parsed.ignoredCount
            },
            purchaseKeys: transactions.map(transaction => transaction.purchaseKey),
            plan: ({ importId, existing }) => planCardImport({
                cardId: card.id,
                importId,
                month,
                transactions,
                existing,
                defaultCategoryId: defaultCategory.id
            })
        });

        return {
            import: this.toResponse({
                ...cardImport,
                expenseCount: plan.updates.length + plan.creates.length
            }),
            summary: {
                ...plan.summary,
                ignored: parsed.ignoredCount
            }
        };
    }

    private async parse(parser: CardStatementParser, input: CardStatementParseInput): Promise<CardStatementParseResult> {
        try {
            return await parser.parse(input);
        } catch (error: unknown) {
            if (error instanceof CardStatementFormatError) {
                throw CARD_IMPORT_ERRORS.unsupportedFormat(`${parser.version}:${error.reason}`);
            }

            throw error;
        }
    }

    private async getById(id: string): Promise<CardImportWithCount> {
        const cardImport = await this.cardImportRepository.findById(id);

        if (!cardImport) {
            throw CARD_IMPORT_ERRORS.notFound('card_import_id_not_found');
        }

        return cardImport;
    }

    private hash(content: Buffer): string {
        return createHash('sha256').update(content).digest('hex');
    }

    private toResponse(cardImport: CardImportWithCount): CardImportResponse {
        return {
            id: cardImport.id,
            cardId: cardImport.cardId,
            month: formatMonth(cardImport.month),
            fileName: cardImport.fileName,
            parserVersion: cardImport.parserVersion,
            rowCount: cardImport.rowCount,
            ignoredCount: cardImport.ignoredCount,
            expenseCount: cardImport.expenseCount,
            createdAt: cardImport.createdAt
        };
    }
}
