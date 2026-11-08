import type { CreditCard } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { addMonths, formatDate, formatMonth, parseMonth } from '../../common/date/month.js';
import {
    CreateCreditCardDto,
    CreditCardBillResponse,
    CreditCardResponse,
    CreditCardSyncResponse,
    ListCreditCardBillsDto,
    UpdateCreditCardBillDto,
    UpdateCreditCardDto
} from '../dto/credit-card.dto.js';
import { CREDIT_CARD_ERRORS } from '../errors/credit-card.errors.js';
import { CreditCardRepository, CreditCardSyncState } from '../repository/credit-card.repository.js';
import { addDays, BillingCalendar, BillSchedule } from './billing-calendar.js';
import { todayInBrazil } from './brazil-time.js';

const MAX_BILLS = 24;

/** Cartão pronto para sincronizar: ligado a um item da Pluggy e com o ciclo da fatura configurado. */
export type SyncableCreditCard = CreditCard & {
    dueDay: number;
    bestPurchaseDay: number;
    pluggyItemId: string;
    syncFromMonth: Date;
};

export function isSyncConfigured(card: CreditCard): card is SyncableCreditCard {
    return card.dueDay !== null && card.bestPurchaseDay !== null && card.pluggyItemId !== null && card.syncFromMonth !== null;
}

/** Situação da sincronização do cartão, no formato da API. */
export function toCreditCardSyncResponse(card: CreditCard): CreditCardSyncResponse {
    return {
        configured: isSyncConfigured(card),
        syncedAt: card.syncedAt,
        dataUpdatedAt: card.syncDataUpdatedAt,
        status: card.syncStatus,
        error: card.syncError,
        consentExpiresAt: card.syncConsentExpiresAt
    };
}

@Injectable()
export class CreditCardService {
    public constructor(private readonly creditCardRepository: CreditCardRepository) { }

    public async create(data: CreateCreditCardDto): Promise<CreditCardResponse> {
        const card = await this.creditCardRepository.create({
            name: this.normalizeName(data.name),
            bank: data.bank,
            dueDay: data.dueDay,
            bestPurchaseDay: data.bestPurchaseDay,
            pluggyItemId: data.pluggyItemId,
            syncFromMonth: data.syncFromMonth === undefined ? undefined : parseMonth(data.syncFromMonth)
        });

        return this.toResponse(card);
    }

    public async findAll(): Promise<CreditCardResponse[]> {
        const cards = await this.creditCardRepository.findAll();

        return cards.map(card => this.toResponse(card));
    }

    /** Cartões ativos ligados ao Meu Pluggy e prontos para sincronizar. */
    public async findSyncable(): Promise<SyncableCreditCard[]> {
        const cards = await this.creditCardRepository.findAll();

        return cards.filter(isSyncConfigured);
    }

    public async findById(id: string): Promise<CreditCardResponse> {
        return this.toResponse(await this.getById(id));
    }

    public async getById(id: string): Promise<CreditCard> {
        const card = await this.creditCardRepository.findById(id);

        if (!card) {
            throw CREDIT_CARD_ERRORS.notFound('credit_card_id_not_found');
        }

        return card;
    }

    public async getActiveById(id: string): Promise<CreditCard> {
        const card = await this.getById(id);

        if (!card.active) {
            throw CREDIT_CARD_ERRORS.inactive('credit_card_inactive');
        }

        return card;
    }

    public async update(id: string, data: UpdateCreditCardDto): Promise<CreditCardResponse> {
        const current = await this.getById(id);
        const itemChanged = data.pluggyItemId !== undefined && data.pluggyItemId !== current.pluggyItemId;

        const card = await this.creditCardRepository.update(id, {
            name: data.name === undefined ? undefined : this.normalizeName(data.name),
            active: data.active,
            dueDay: data.dueDay,
            bestPurchaseDay: data.bestPurchaseDay,
            pluggyItemId: data.pluggyItemId,
            // Outro item = outra conta de cartão: descoberta de novo na próxima sincronização.
            pluggyAccountId: itemChanged ? null : undefined,
            syncFromMonth: data.syncFromMonth === undefined || data.syncFromMonth === null
                ? data.syncFromMonth
                : parseMonth(data.syncFromMonth)
        });

        return this.toResponse(card);
    }

    public async updateSyncState(id: string, state: CreditCardSyncState): Promise<CreditCard> {
        return this.creditCardRepository.updateSyncState(id, state);
    }

    /** Calendário de faturas do cartão; exige vencimento e melhor dia configurados. */
    public async getCalendar(card: CreditCard): Promise<BillingCalendar> {
        if (card.dueDay === null || card.bestPurchaseDay === null) {
            throw CREDIT_CARD_ERRORS.billingNotConfigured('credit_card_billing_days_missing');
        }

        const bills = await this.creditCardRepository.findBills(card.id);

        return new BillingCalendar({ dueDay: card.dueDay, bestPurchaseDay: card.bestPurchaseDay }, bills);
    }

    /** Fechamento e vencimento informados pelo banco para faturas já fechadas. */
    public async saveBankBillDates(cardId: string, bills: { month: Date; closingDate: Date; dueDate: Date }[]): Promise<void> {
        if (bills.length > 0) {
            await this.creditCardRepository.saveBankDates(cardId, bills);
        }
    }

    /** Faturas do período (padrão: da anterior à aberta até duas depois dela). */
    public async listBills(id: string, query: ListCreditCardBillsDto): Promise<CreditCardBillResponse[]> {
        const calendar = await this.getCalendar(await this.getById(id));
        const open = calendar.billMonthOf(todayInBrazil());
        const from = query.from === undefined ? addMonths(open, -1) : parseMonth(query.from);
        const to = query.to === undefined ? addMonths(from, 3) : parseMonth(query.to);
        const count = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;

        if (count < 1 || count > MAX_BILLS) {
            throw CREDIT_CARD_ERRORS.billRangeInvalid(`bill_range_${count}`);
        }

        return Array.from({ length: count }, (_, index) => this.toBillResponse(calendar, addMonths(from, index)));
    }

    /**
     * Ajusta o melhor dia de compra de uma fatura (o banco muda o fechamento de mês a mês). A data
     * precisa ficar entre o início do mês anterior e o fim do mês da fatura.
     */
    public async updateBill(id: string, month: string, data: UpdateCreditCardBillDto): Promise<CreditCardBillResponse> {
        const card = await this.getById(id);

        await this.getCalendar(card);

        const billMonth = parseMonth(month);
        const bestPurchaseDate = data.bestPurchaseDate === null ? null : new Date(`${data.bestPurchaseDate}T00:00:00.000Z`);

        if (bestPurchaseDate && (bestPurchaseDate < addMonths(billMonth, -1) || bestPurchaseDate >= addMonths(billMonth, 1))) {
            throw CREDIT_CARD_ERRORS.billDateOutOfRange(`best_purchase_date_${data.bestPurchaseDate}_for_${month}`);
        }

        await this.creditCardRepository.saveBestPurchaseDate(card.id, billMonth, bestPurchaseDate);

        return this.toBillResponse(await this.getCalendar(card), billMonth);
    }

    private toBillResponse(calendar: BillingCalendar, month: Date): CreditCardBillResponse {
        const schedule: BillSchedule = calendar.schedule(month);
        const previous = calendar.schedule(addMonths(month, -1));

        return {
            month: formatMonth(month),
            startDate: formatDate(previous.bestPurchaseDate),
            closingDate: formatDate(addDays(schedule.bestPurchaseDate, -1)),
            bestPurchaseDate: formatDate(schedule.bestPurchaseDate),
            dueDate: formatDate(schedule.dueDate),
            source: schedule.source,
            userBestPurchaseDate: schedule.userBestPurchaseDate === null ? null : formatDate(schedule.userBestPurchaseDate)
        };
    }

    private normalizeName(name: string): string {
        return name.trim().replace(/\s+/g, ' ');
    }

    private toResponse(card: CreditCard): CreditCardResponse {
        return {
            id: card.id,
            name: card.name,
            bank: card.bank,
            active: card.active,
            dueDay: card.dueDay,
            bestPurchaseDay: card.bestPurchaseDay,
            pluggyItemId: card.pluggyItemId,
            syncFromMonth: card.syncFromMonth === null ? null : formatMonth(card.syncFromMonth),
            sync: toCreditCardSyncResponse(card),
            createdAt: card.createdAt,
            updatedAt: card.updatedAt
        };
    }
}
