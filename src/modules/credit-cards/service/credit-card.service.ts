import type { CardBill, CreditCard } from '../../../generated/prisma/client.js';
import { Injectable } from '@nestjs/common';

import { addMonths, formatDate, formatMonth, parseMonth } from '../../common/date/month.js';
import { formatAmountCents } from '../../common/money/money.js';
import {
    CreateCreditCardDto,
    CreditCardBillResponse,
    CreditCardBillStatusResponse,
    CreditCardResponse,
    CreditCardSyncResponse,
    ListCreditCardBillsDto,
    UpdateCreditCardBillDto,
    UpdateCreditCardDto
} from '../dto/credit-card.dto.js';
import { CREDIT_CARD_ERRORS } from '../errors/credit-card.errors.js';
import { CreditCardRepository, CreditCardSyncState } from '../repository/credit-card.repository.js';
import { BillTiming, isBillClosed, resolveBillStatus } from './bill-status.js';
import { addDays, BillingCalendar, BillSchedule, dayInMonth } from './billing-calendar.js';
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

    /**
     * Marca a fatura como paga, guardando o total do momento. Só fatura fechada; marcar de novo
     * confirma o total atual (depois de uma compra que chegou atrasada).
     */
    public async markBillPaid(id: string, month: string): Promise<CreditCardBillStatusResponse> {
        const card = await this.getById(id);
        const billMonth = parseMonth(month);
        const bills = await this.creditCardRepository.findBills(card.id);
        const timing = this.billTiming(card, billMonth, bills);

        if (!isBillClosed(timing, todayInBrazil())) {
            throw CREDIT_CARD_ERRORS.billNotClosed(`bill_${month}_not_closed`);
        }

        const totalCents = await this.billTotal(card.id, billMonth);
        const bill = await this.creditCardRepository.savePayment(card.id, billMonth, { paidAt: new Date(), paidAmountCents: totalCents });

        return this.toBillStatusResponse(card.id, timing, bill, totalCents);
    }

    /** Desmarca o pagamento da fatura (volta a fechada, vencida ou aberta, conforme as datas). */
    public async unmarkBillPaid(id: string, month: string): Promise<CreditCardBillStatusResponse> {
        const card = await this.getById(id);
        const billMonth = parseMonth(month);
        const timing = this.billTiming(card, billMonth, await this.creditCardRepository.findBills(card.id));
        const bill = await this.creditCardRepository.savePayment(card.id, billMonth, { paidAt: null, paidAmountCents: null });

        return this.toBillStatusResponse(card.id, timing, bill, await this.billTotal(card.id, billMonth));
    }

    /** Fechamento e vencimento da fatura; sem o ciclo configurado, só o vencimento que der para saber. */
    private billTiming(card: CreditCard, month: Date, bills: CardBill[]): BillTiming {
        if (card.dueDay !== null && card.bestPurchaseDay !== null) {
            const schedule = new BillingCalendar({ dueDay: card.dueDay, bestPurchaseDay: card.bestPurchaseDay }, bills).schedule(month);

            return { month, closingDate: schedule.closingDate, dueDate: schedule.dueDate };
        }

        const stored = bills.find(bill => bill.month.getTime() === month.getTime());
        const dueDate = stored?.bankDueDate ?? (card.dueDay === null ? null : dayInMonth(month, card.dueDay));

        return { month, closingDate: null, dueDate };
    }

    private async billTotal(cardId: string, month: Date): Promise<bigint> {
        const [total] = await this.creditCardRepository.sumBillTotals({ cardId, month });

        return total?.totalCents ?? 0n;
    }

    private toBillStatusResponse(
        cardId: string,
        timing: BillTiming,
        bill: Pick<CardBill, 'paidAt' | 'paidAmountCents'> | undefined,
        totalCents: bigint
    ): CreditCardBillStatusResponse {
        const paidAt = bill?.paidAt ?? null;
        const paidAmountCents = paidAt ? bill?.paidAmountCents ?? null : null;

        return {
            cardId,
            month: formatMonth(timing.month),
            status: resolveBillStatus({ ...timing, paidAt }, todayInBrazil()),
            total: formatAmountCents(totalCents),
            closingDate: timing.closingDate === null ? null : formatDate(timing.closingDate),
            dueDate: timing.dueDate === null ? null : formatDate(timing.dueDate),
            paidAt,
            paidAmount: paidAmountCents === null ? null : formatAmountCents(paidAmountCents),
            changedAfterPayment: paidAmountCents !== null && paidAmountCents !== totalCents
        };
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
