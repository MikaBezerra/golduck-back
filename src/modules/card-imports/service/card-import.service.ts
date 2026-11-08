import type { CreditCard } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { extname } from 'path';

import { toCardExpenseResponse } from '../../card-expenses/service/card-expense.mapper.js';
import { CategoryService } from '../../categories/service/category.service.js';
import { formatMonth, parseMonth } from '../../common/date/month.js';
import { formatAmountCents, parsePositiveAmountCents } from '../../common/money/money.js';
import { CreditCardService } from '../../credit-cards/service/credit-card.service.js';
import { PersonService } from '../../people/service/person.service.js';
import {
    CardImportExclusionDto,
    CardImportOverrideDto,
    CardImportPreviewResponse,
    CardImportResponse,
    CardImportResultResponse,
    CreateCardImportDto,
    CreateManualCardImportDto,
    ListCardImportsDto
} from '../dto/card-import.dto.js';
import { CARD_IMPORT_ERRORS } from '../errors/card-import.errors.js';
import { CardStatementParserRegistry } from '../parsers/card-statement-parser.registry.js';
import {
    CardStatementFormatError,
    CardStatementParseResult,
    CardStatementParser,
    CardStatementParseInput,
    CardStatementPasswordError,
    normalizeDescription,
    ParsedCardTransaction
} from '../parsers/card-statement.parser.js';
import { CardImportRepository, CardImportWithCount, PurchaseExclusionDecision } from '../repository/card-import.repository.js';
import { assignPurchaseKeys, CardExpensePersonalization, KeyedTransaction, planCardImport } from './card-import.planner.js';

export type UploadedStatementFile = {
    fileName: string;
    content: Buffer;
};

type ImportSource = {
    fileName: string;
    fileHash: string;
    parserVersion: string;
};

type PreparedUpload = {
    card: CreditCard;
    month: Date;
    parsed: CardStatementParseResult;
    source: ImportSource;
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
        private readonly personService: PersonService,
        private readonly parsers: CardStatementParserRegistry
    ) { }

    /**
     * Upload do arquivo exportado pelo banco do cartão. As escolhas do usuário
     * (overrides), feitas na pré-visualização, valem para a linha do mês e para as
     * parcelas futuras lançadas por ela. O arquivo é lido de novo: ele continua
     * sendo a fonte da verdade.
     */
    public async create(
        data: CreateCardImportDto,
        file: UploadedStatementFile,
        overrides: CardImportOverrideDto[] = [],
        exclusions: CardImportExclusionDto[] = []
    ): Promise<CardImportResultResponse> {
        const { card, month, parsed, source } = await this.prepareUpload(data, file);
        const transactions = assignPurchaseKeys(parsed.transactions, month);
        const choices = await this.resolveOverrides(overrides, transactions);
        const decisions = this.resolveExclusions(exclusions, transactions);

        return this.applyImport(card, month, transactions, parsed.ignoredCount, source, choices, decisions);
    }

    /**
     * Mostra o que o upload faria, sem gravar nada: as compras do arquivo (novas ou
     * atualizadas, com a sugestão de apelido, categoria e pessoa), as despesas do mês
     * que seriam apagadas e o resumo.
     */
    public async preview(data: CreateCardImportDto, file: UploadedStatementFile): Promise<CardImportPreviewResponse> {
        const { card, month, parsed, source } = await this.prepareUpload(data, file);
        const transactions = assignPurchaseKeys(parsed.transactions, month);
        const defaultCategory = await this.categoryService.findDefault();
        const context = await this.cardImportRepository.loadPlanningContext(
            card.id,
            month,
            transactions.map(transaction => transaction.purchaseKey)
        );
        const plan = planCardImport({
            cardId: card.id,
            month,
            transactions,
            existing: context.existing,
            nextImportedMonth: context.nextImportedMonth,
            defaultCategoryId: defaultCategory.id
        });
        const deleted = new Set(plan.deleteIds);
        const removed = context.existing
            .filter(row => deleted.has(row.id) && row.month.getTime() === month.getTime())
            .sort((first, second) =>
                first.transactionDate.getTime() - second.transactionDate.getTime()
                || first.originalDescription.localeCompare(second.originalDescription)
                || first.id.localeCompare(second.id));

        return {
            cardId: card.id,
            month: formatMonth(month),
            fileName: source.fileName,
            transactions: plan.transactions.map(({ transaction, status, suggestion, projectedCount, excluded, askExclusion }) => ({
                key: transaction.purchaseKey,
                status,
                transactionDate: transaction.transactionDate,
                description: transaction.description,
                amount: formatAmountCents(transaction.amountCents),
                installment: transaction.installmentNumber !== null && transaction.installmentTotal !== null
                    ? { number: transaction.installmentNumber, total: transaction.installmentTotal }
                    : null,
                holderName: transaction.holderName,
                cardLastDigits: transaction.cardLastDigits,
                nickname: suggestion.nickname,
                categoryId: suggestion.categoryId,
                personId: suggestion.personId,
                projectedCount,
                excluded,
                askExclusion
            })),
            removed: removed.map(row => toCardExpenseResponse(row)),
            summary: {
                ...plan.summary,
                ignored: parsed.ignoredCount
            }
        };
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

        const month = parseMonth(data.month);

        return this.applyImport(card, month, assignPurchaseKeys(transactions, month), 0, {
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
        transactions: KeyedTransaction[],
        ignoredCount: number,
        source: ImportSource,
        overrides?: ReadonlyMap<string, CardExpensePersonalization>,
        exclusions?: PurchaseExclusionDecision[]
    ): Promise<CardImportResultResponse> {
        const defaultCategory = await this.categoryService.findDefault();
        const { cardImport, plan } = await this.cardImportRepository.apply({
            data: {
                ...source,
                cardId: card.id,
                month,
                rowCount: transactions.length,
                ignoredCount
            },
            purchaseKeys: transactions.map(transaction => transaction.purchaseKey),
            plan: ({ existing, nextImportedMonth }) => planCardImport({
                cardId: card.id,
                month,
                transactions,
                existing,
                nextImportedMonth,
                defaultCategoryId: defaultCategory.id,
                overrides
            }),
            exclusions
        });

        return {
            import: this.toResponse({
                ...cardImport,
                expenseCount: plan.updates.length + plan.creates.length
            }),
            summary: {
                ...plan.summary,
                ignored: ignoredCount
            }
        };
    }

    /**
     * Confere as escolhas do usuário antes de gravar: cada key precisa estar no
     * arquivo (senão a fatura mudou desde a pré-visualização) e categoria e pessoa
     * precisam existir e estar ativas.
     */
    private async resolveOverrides(
        overrides: CardImportOverrideDto[],
        transactions: KeyedTransaction[]
    ): Promise<ReadonlyMap<string, CardExpensePersonalization>> {
        const fileKeys = new Set(transactions.map(transaction => transaction.purchaseKey));

        if (overrides.some(override => !fileKeys.has(override.key))) {
            throw CARD_IMPORT_ERRORS.overrideUnknownKey('override_key_not_in_file');
        }

        for (const categoryId of new Set(overrides.map(override => override.categoryId))) {
            if (!(await this.categoryService.findById(categoryId)).active) {
                throw CARD_IMPORT_ERRORS.inactiveCategory('category_inactive');
            }
        }

        const personIds = overrides
            .map(override => override.personId)
            .filter((personId): personId is string => personId !== null);

        for (const personId of new Set(personIds)) {
            if (!(await this.personService.findById(personId)).active) {
                throw CARD_IMPORT_ERRORS.inactivePerson('person_inactive');
            }
        }

        return new Map(overrides.map(override => [override.key, {
            nickname: override.nickname,
            categoryId: override.categoryId,
            personId: override.personId
        }]));
    }

    /**
     * Decisões de excluir, manter excluída ou restaurar compras do arquivo. Cada key
     * precisa estar no arquivo; em compra à vista o escopo é sempre o próprio mês.
     */
    private resolveExclusions(
        exclusions: CardImportExclusionDto[],
        transactions: KeyedTransaction[]
    ): PurchaseExclusionDecision[] {
        const byKey = new Map(transactions.map(transaction => [transaction.purchaseKey, transaction]));

        return exclusions.map(exclusion => {
            const transaction = byKey.get(exclusion.key);

            if (!transaction) {
                throw CARD_IMPORT_ERRORS.overrideUnknownKey('exclusion_key_not_in_file');
            }

            return {
                purchaseKey: exclusion.key,
                action: exclusion.action,
                scope: transaction.installmentTotal === null ? 'month' : exclusion.scope,
                remember: exclusion.action === 'exclude' && exclusion.remember
            };
        });
    }

    /** Validações comuns ao upload e à pré-visualização: cartão ativo, tipo do arquivo e leitura. */
    private async prepareUpload(data: CreateCardImportDto, file: UploadedStatementFile): Promise<PreparedUpload> {
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

        return {
            card,
            month,
            parsed,
            source: {
                fileName: file.fileName.slice(0, MAX_FILE_NAME_LENGTH),
                fileHash: this.hash(file.content),
                parserVersion: parser.version
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

            if (error instanceof CardStatementPasswordError) {
                throw CARD_IMPORT_ERRORS.passwordInvalid(error.reason);
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
