import type { SyncedTransaction } from './pluggy-transaction.normalizer.js';
import type { CardExpense } from '../../../generated/prisma/client.js';
import type { NewCardExpenseRow } from '../../card-expenses/repository/card-expense.repository.js';
import type { PurchaseAnchor } from '../../card-expenses/service/purchase-schedule.js';

import { CardExpenseOrigin } from '../../../generated/prisma/client.js';
import { scheduleInstallments } from '../../card-expenses/service/purchase-schedule.js';
import { addMonths, formatDate, formatMonth } from '../../common/date/month.js';

/*
 * Plano da sincronização de um cartão (funções puras, sem banco). A sincronização é a fonte da
 * verdade dos meses a partir de syncFromMonth:
 *
 * 1. Cada compra recebe uma chave estável (purchaseKey): parcelada = data da compra + total de parcelas
 *    + descrição; à vista = data + valor + descrição. Repetições idênticas recebem #2, #3...
 * 2. A fatura de cada lançamento vem, nesta ordem: da correção do usuário (mover de mês/parcela), da
 *    fatura informada pelo banco (billId) ou do calendário do cartão (melhor dia de compra).
 * 3. As parcelas que o banco ainda não mandou (as futuras no C6, todas menos a 1ª no Neon) são lançadas
 *    a partir da última conhecida, uma por mês.
 * 4. Linhas que já existem na mesma fatura são atualizadas, mantendo apelido, categoria, pessoa e
 *    exclusão. Linhas novas herdam isso de outra parcela da mesma compra.
 * 5. Linhas sincronizadas ou de upload nos meses controlados que não vieram são removidas: uma compra
 *    que mudou de fatura sai da antiga e entra na nova. As de "Adicionar compra" ficam, a não ser que o
 *    banco traga a mesma compra (mesmo valor e total de parcelas, até 3 dias de diferença): aí a do
 *    banco a substitui e herda a personalização.
 */

const MAX_DESCRIPTION_LENGTH = 200;
const MANUAL_MATCH_DAYS = 3;
const DAY_MS = 86_400_000;

export type CardSyncPlanInput = {
    cardId: string;
    /** Primeira fatura controlada pela sincronização. */
    syncFromMonth: Date;
    transactions: SyncedTransaction[];
    /** Fatura (mês do vencimento) de um dia de lançamento, pelo calendário do cartão. */
    billMonthOf: (day: Date) => Date;
    /** Mês do vencimento de cada fatura que o banco informou (billId). */
    billMonthById: ReadonlyMap<string, Date>;
    /** Correções do usuário, por purchaseKey. */
    corrections: ReadonlyMap<string, PurchaseAnchor>;
    /** Linhas do cartão a partir de syncFromMonth e as das compras sincronizadas, em qualquer mês. */
    existing: CardExpense[];
    defaultCategoryId: string;
};

/** Dados que vêm do banco: atualizados a cada sincronização. */
export type SyncedRowData = Pick<
    CardExpense,
    'transactionDate' | 'originalDescription' | 'cardLastDigits' | 'amountCents' | 'installmentNumber'
    | 'installmentTotal' | 'sourceMonth' | 'externalId' | 'origin' | 'importId'
>;

export type CardSyncPlan = {
    deleteIds: string[];
    updates: { id: string; data: SyncedRowData }[];
    creates: NewCardExpenseRow[];
    summary: {
        created: number;
        updated: number;
        unchanged: number;
        removed: number;
        /** Compras de "Adicionar compra" substituídas pela do banco. */
        replacedManual: number;
    };
};

type KeyedTransaction = SyncedTransaction & { purchaseKey: string };

type DesiredRow = {
    purchaseKey: string;
    month: Date;
    data: SyncedRowData;
};

type Personalization = Pick<CardExpense, 'nickname' | 'categoryId' | 'personId' | 'excludedAt' | 'exclusionRemembered'>;

export function planCardSync(input: CardSyncPlanInput): CardSyncPlan {
    const purchases = groupByPurchase(assignSyncKeys(input.transactions));
    const desired: DesiredRow[] = [];

    for (const [purchaseKey, installments] of purchases) {
        desired.push(...scheduleRows(purchaseKey, installments, input)
            .filter(row => row.month.getTime() >= input.syncFromMonth.getTime()));
    }

    return diff(input, desired);
}

/** Chaves das compras (veja a regra 1). */
export function assignSyncKeys(transactions: SyncedTransaction[]): KeyedTransaction[] {
    const occurrences = new Map<string, number>();

    return [...transactions]
        .sort((first, second) => first.order.localeCompare(second.order))
        .map(transaction => {
            const description = transaction.description.toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ').trim();
            const baseKey = transaction.installmentTotal === null
                ? ['S', formatDate(transaction.purchaseDate), transaction.amountCents.toString(), description].join('|')
                : ['P', formatDate(transaction.purchaseDate), transaction.installmentTotal, description].join('|');
            // Parcelas diferentes da mesma compra dividem a chave; a mesma parcela repetida é outra compra.
            const slot = `${baseKey}@${transaction.installmentNumber ?? 0}`;
            const occurrence = (occurrences.get(slot) ?? 0) + 1;

            occurrences.set(slot, occurrence);

            return { ...transaction, purchaseKey: occurrence === 1 ? baseKey : `${baseKey}#${occurrence}` };
        });
}

function groupByPurchase(transactions: KeyedTransaction[]): Map<string, KeyedTransaction[]> {
    const purchases = new Map<string, KeyedTransaction[]>();

    for (const transaction of transactions) {
        purchases.set(transaction.purchaseKey, [...purchases.get(transaction.purchaseKey) ?? [], transaction]);
    }

    return purchases;
}

/** As linhas de uma compra, cada uma na sua fatura (regras 2 e 3). */
function scheduleRows(purchaseKey: string, installments: KeyedTransaction[], input: CardSyncPlanInput): DesiredRow[] {
    const byNumber = new Map(installments.map(transaction => [transaction.installmentNumber ?? 0, transaction]));
    const latest = installments.reduce((last, transaction) =>
        (transaction.installmentNumber ?? 0) > (last.installmentNumber ?? 0) ? transaction : last);
    const correction = input.corrections.get(purchaseKey);
    const billOf = (transaction: KeyedTransaction): Date =>
        (transaction.billId ? input.billMonthById.get(transaction.billId) : undefined) ?? input.billMonthOf(transaction.postedDate);
    const row = (transaction: KeyedTransaction, month: Date, installmentNumber: number | null, installmentTotal: number | null): DesiredRow => ({
        purchaseKey,
        month,
        data: {
            transactionDate: transaction.purchaseDate,
            originalDescription: transaction.description.slice(0, MAX_DESCRIPTION_LENGTH),
            cardLastDigits: transaction.cardLastDigits,
            amountCents: transaction.amountCents,
            installmentNumber,
            installmentTotal,
            sourceMonth: addMonths(month, 1 - (installmentNumber ?? 1)),
            // Só a parcela que veio do banco tem id; as lançadas pela sincronização, não.
            externalId: installmentNumber === transaction.installmentNumber ? transaction.externalId : null,
            origin: CardExpenseOrigin.SYNC,
            importId: null
        }
    });

    if (correction) {
        const installmentTotal = latest.installmentTotal === null ? null : correction.installmentTotal ?? latest.installmentTotal;

        return scheduleInstallments({ ...correction, installmentTotal }).map(installment =>
            row(byNumber.get(installment.installmentNumber ?? 0) ?? latest, installment.month, installment.installmentNumber, installmentTotal));
    }

    if (latest.installmentNumber === null || latest.installmentTotal === null) {
        return [row(latest, billOf(latest), null, null)];
    }

    const rows: DesiredRow[] = [];

    for (const transaction of [...installments].sort((first, second) => (first.installmentNumber ?? 0) - (second.installmentNumber ?? 0))) {
        const billMonth = billOf(transaction);
        const previous = rows.at(-1)?.month;
        // Duas parcelas da mesma compra nunca dividem a fatura: a seguinte vai para o mês depois da anterior.
        const month = previous && billMonth.getTime() <= previous.getTime() ? addMonths(previous, 1) : billMonth;

        rows.push(row(transaction, month, transaction.installmentNumber, transaction.installmentTotal));
    }

    const latestMonth = rows[rows.length - 1].month;

    for (let number = latest.installmentNumber + 1; number <= latest.installmentTotal; number++) {
        rows.push(row(latest, addMonths(latestMonth, number - latest.installmentNumber), number, latest.installmentTotal));
    }

    return rows;
}

/** Compara com o que está gravado (regras 4 e 5). */
function diff(input: CardSyncPlanInput, desired: DesiredRow[]): CardSyncPlan {
    const fromTime = input.syncFromMonth.getTime();
    const slot = (purchaseKey: string, month: Date): string => `${purchaseKey}@${formatMonth(month)}`;
    const bySlot = new Map<string, CardExpense>();
    const latestByKey = new Map<string, CardExpense>();
    const manualPurchases = new Map<string, CardExpense[]>();

    for (const row of input.existing) {
        if (row.origin === CardExpenseOrigin.MANUAL) {
            manualPurchases.set(row.purchaseKey, [...manualPurchases.get(row.purchaseKey) ?? [], row]);
            continue;
        }

        bySlot.set(slot(row.purchaseKey, row.month), row);

        const latest = latestByKey.get(row.purchaseKey);

        if (!latest || row.month.getTime() > latest.month.getTime()) {
            latestByKey.set(row.purchaseKey, row);
        }
    }

    const plan: CardSyncPlan = {
        deleteIds: [],
        updates: [],
        creates: [],
        summary: { created: 0, updated: 0, unchanged: 0, removed: 0, replacedManual: 0 }
    };
    const desiredSlots = new Set(desired.map(row => slot(row.purchaseKey, row.month)));
    const inherited = new Map<string, Personalization>();

    for (const row of desired) {
        const current = bySlot.get(slot(row.purchaseKey, row.month));

        if (current) {
            if (sameData(current, row.data)) {
                plan.summary.unchanged++;
            } else {
                plan.updates.push({ id: current.id, data: row.data });
                plan.summary.updated++;
            }

            continue;
        }

        if (!inherited.has(row.purchaseKey)) {
            const source = latestByKey.get(row.purchaseKey) ?? takeManualMatch(row, manualPurchases, plan);

            inherited.set(row.purchaseKey, source
                ? personalizationOf(source)
                : { nickname: null, categoryId: input.defaultCategoryId, personId: null, excludedAt: null, exclusionRemembered: false });
        }

        plan.creates.push({
            ...row.data,
            ...inherited.get(row.purchaseKey) as Personalization,
            cardId: input.cardId,
            month: row.month,
            purchaseKey: row.purchaseKey,
            holderName: null
        });
        plan.summary.created++;
    }

    for (const row of bySlot.values()) {
        if (row.month.getTime() >= fromTime && !desiredSlots.has(slot(row.purchaseKey, row.month))) {
            plan.deleteIds.push(row.id);
            plan.summary.removed++;
        }
    }

    return plan;
}

/**
 * A compra de "Adicionar compra" que corresponde a esta compra do banco: mesmo valor, mesmo total de
 * parcelas e data até 3 dias de diferença. Encontrada, sai do mapa e suas linhas vão para a remoção.
 */
function takeManualMatch(row: DesiredRow, manualPurchases: Map<string, CardExpense[]>, plan: CardSyncPlan): CardExpense | null {
    for (const [purchaseKey, rows] of manualPurchases) {
        const sample = rows[0];
        const days = Math.abs(sample.transactionDate.getTime() - row.data.transactionDate.getTime()) / DAY_MS;

        if (sample.amountCents === row.data.amountCents && sample.installmentTotal === row.data.installmentTotal && days <= MANUAL_MATCH_DAYS) {
            manualPurchases.delete(purchaseKey);
            plan.deleteIds.push(...rows.map(manual => manual.id));
            plan.summary.replacedManual++;

            return sample;
        }
    }

    return null;
}

function personalizationOf(row: CardExpense): Personalization {
    return {
        nickname: row.nickname,
        categoryId: row.categoryId,
        personId: row.personId,
        excludedAt: row.excludedAt,
        exclusionRemembered: row.exclusionRemembered
    };
}

function sameData(row: CardExpense, data: SyncedRowData): boolean {
    return row.transactionDate.getTime() === data.transactionDate.getTime()
        && row.originalDescription === data.originalDescription
        && row.cardLastDigits === data.cardLastDigits
        && row.amountCents === data.amountCents
        && row.installmentNumber === data.installmentNumber
        && row.installmentTotal === data.installmentTotal
        && row.sourceMonth.getTime() === data.sourceMonth.getTime()
        && row.externalId === data.externalId
        && row.origin === data.origin
        && row.importId === data.importId;
}
