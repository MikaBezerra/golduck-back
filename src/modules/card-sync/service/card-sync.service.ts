import type { CreditCard } from '../../../generated/prisma/client.js';
import type { Config } from '../../common/index.js';
import { Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { CategoryService } from '../../categories/service/category.service.js';
import { addMonths, formatDate } from '../../common/date/month.js';
import { AppError } from '../../common/errors/app-error.js';
import { monthOf } from '../../credit-cards/service/billing-calendar.js';
import { CreditCardService, isSyncConfigured, SyncableCreditCard, toCreditCardSyncResponse } from '../../credit-cards/service/credit-card.service.js';
import { Service } from '../../tokens.js';
import { CardSyncResultResponse } from '../dto/card-sync.dto.js';
import { CARD_SYNC_ERRORS } from '../errors/card-sync.errors.js';
import { PluggyBill, PluggyClient, PluggyItem, PluggyRequestError } from '../pluggy/pluggy-client.js';
import { CardSyncRepository } from '../repository/card-sync.repository.js';
import { assignSyncKeys, planCardSync } from './card-sync.planner.js';
import { normalizePluggyTransactions } from './pluggy-transaction.normalizer.js';

/**
 * Quantos meses antes da primeira fatura sincronizada buscar: compras parceladas antigas ainda têm
 * parcelas nas faturas atuais (o Neon só manda a 1ª parcela, na data da compra). A Pluggy guarda
 * 12 meses de histórico.
 */
const HISTORY_MONTHS = 13;
const MAX_ERROR_LENGTH = 300;

@Injectable()
export class CardSyncService {
    public constructor(
        private readonly cardSyncRepository: CardSyncRepository,
        private readonly creditCardService: CreditCardService,
        private readonly categoryService: CategoryService,
        private readonly pluggy: PluggyClient,
        @Inject(Service.CONFIG) private readonly config: Config
    ) { }

    /** Sincroniza um cartão; erros viram a resposta de erro da API. */
    public async syncCard(cardId: string): Promise<CardSyncResultResponse> {
        return this.sync(await this.creditCardService.getActiveById(cardId));
    }

    /**
     * Sincroniza todos os cartões ativos ligados ao Meu Pluggy, um por vez. O erro de um cartão não
     * impede os outros: ele vai no resultado daquele cartão.
     */
    public async syncAll(): Promise<CardSyncResultResponse[]> {
        const results: CardSyncResultResponse[] = [];

        for (const card of await this.creditCardService.findSyncable()) {
            try {
                results.push(await this.sync(card));
            } catch (error: unknown) {
                const appError = error instanceof AppError ? error : CARD_SYNC_ERRORS.pluggyUnavailable('unexpected_error');
                const current = await this.creditCardService.getById(card.id);

                results.push({
                    cardId: card.id,
                    cardName: card.name,
                    summary: null,
                    error: { code: appError.code, message: appError.publicMessage },
                    sync: toCreditCardSyncResponse(current)
                });
            }
        }

        return results;
    }

    /** A rotina da Vercel manda "Authorization: Bearer <CRON_SECRET>". */
    public verifyCronAuthorization(authorization: string | undefined): void {
        const secret = this.config.CRON_SECRET;
        const expected = Buffer.from(`Bearer ${secret ?? ''}`);
        const received = Buffer.from(authorization ?? '');

        if (!secret || expected.length !== received.length || !timingSafeEqual(expected, received)) {
            throw CARD_SYNC_ERRORS.cronUnauthorized(secret ? 'cron_secret_mismatch' : 'cron_secret_missing');
        }
    }

    private async sync(card: CreditCard): Promise<CardSyncResultResponse> {
        if (!isSyncConfigured(card)) {
            throw CARD_SYNC_ERRORS.notConfigured('card_sync_settings_missing');
        }

        try {
            return await this.run(card);
        } catch (error: unknown) {
            const appError = this.toAppError(error);

            await this.creditCardService.updateSyncState(card.id, { syncError: appError.publicMessage.slice(0, MAX_ERROR_LENGTH) });

            throw appError;
        }
    }

    private async run(card: SyncableCreditCard): Promise<CardSyncResultResponse> {
        const item = await this.pluggy.getItem(card.pluggyItemId);
        const accountId = card.pluggyAccountId ?? await this.findCreditAccount(card.pluggyItemId);
        const dateFrom = formatDate(addMonths(card.syncFromMonth, -HISTORY_MONTHS));
        const [transactions, bills] = await Promise.all([
            this.pluggy.listTransactions(accountId, dateFrom),
            this.pluggy.listBills(accountId)
        ]);
        const billMonthById = new Map(bills.map(bill => [bill.id, monthOf(toDay(bill.dueDate))]));

        // As faturas fechadas trazem o fechamento de verdade: ele passa a valer sobre o melhor dia.
        await this.creditCardService.saveBankBillDates(card.id, this.closedBills(bills, addMonths(card.syncFromMonth, -1)));

        const calendar = await this.creditCardService.getCalendar(card);
        const defaultCategory = await this.categoryService.findDefault();
        const normalized = normalizePluggyTransactions(card.bank, transactions);
        const plan = await this.cardSyncRepository.apply(
            {
                cardId: card.id,
                syncFromMonth: card.syncFromMonth,
                purchaseKeys: [...new Set(assignSyncKeys(normalized.transactions).map(transaction => transaction.purchaseKey))]
            },
            context => planCardSync({
                cardId: card.id,
                syncFromMonth: card.syncFromMonth,
                transactions: normalized.transactions,
                billMonthOf: day => calendar.billMonthOf(day),
                billMonthById,
                corrections: new Map(context.corrections.map(correction => [correction.purchaseKey, correction])),
                existing: context.existing,
                defaultCategoryId: defaultCategory.id
            })
        );
        const updated = await this.creditCardService.updateSyncState(card.id, {
            pluggyAccountId: accountId,
            syncedAt: new Date(),
            ...this.itemState(item),
            syncError: null
        });

        return {
            cardId: card.id,
            cardName: card.name,
            summary: { ...plan.summary, ignored: normalized.ignoredCount },
            error: null,
            sync: toCreditCardSyncResponse(updated)
        };
    }

    private async findCreditAccount(itemId: string): Promise<string> {
        const account = (await this.pluggy.listAccounts(itemId)).find(candidate => candidate.type === 'CREDIT');

        if (!account) {
            throw CARD_SYNC_ERRORS.noCreditAccount(`item_${itemId}_without_credit_account`);
        }

        return account.id;
    }

    /** Faturas fechadas a partir de um mês, com fechamento e vencimento. */
    private closedBills(bills: PluggyBill[], from: Date): { month: Date; closingDate: Date; dueDate: Date }[] {
        return bills
            .filter((bill): bill is PluggyBill & { billClosingDate: string } => Boolean(bill.billClosingDate))
            .map(bill => ({ month: monthOf(toDay(bill.dueDate)), closingDate: toDay(bill.billClosingDate), dueDate: toDay(bill.dueDate) }))
            .filter(bill => bill.month.getTime() >= from.getTime());
    }

    private itemState(item: PluggyItem): { syncDataUpdatedAt: Date | null; syncStatus: string; syncConsentExpiresAt: Date | null } {
        return {
            syncDataUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
            syncStatus: item.status.slice(0, 40),
            syncConsentExpiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null
        };
    }

    private toAppError(error: unknown): AppError {
        if (error instanceof AppError) {
            return error;
        }

        if (error instanceof PluggyRequestError) {
            const reason = `pluggy_${error.status}_${error.code}`;

            if (error.code === 'CLIENT_KEYS_UNAUTHORIZED' || error.code === 'CLIENT_DISABLED') {
                return CARD_SYNC_ERRORS.pluggyAuthFailed(reason);
            }

            return error.status === 404 ? CARD_SYNC_ERRORS.itemNotFound(reason) : CARD_SYNC_ERRORS.pluggyUnavailable(reason);
        }

        throw error;
    }
}

/** "2026-11-01T00:00:00" → o dia 2026-11-01 (meia-noite UTC), sem mexer no fuso. */
function toDay(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
