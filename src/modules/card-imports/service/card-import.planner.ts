import type { CardExpense } from '../../../generated/prisma/client';
import type { ParsedCardTransaction } from '../parsers/card-statement.parser';
import { addMonths, formatMonth } from '../../common/date/month';

/*
 * Regras da conciliação de um upload do mês M (todas puras, sem banco de dados):
 *
 * 1. O upload é absoluto para M: compras de M que não vieram no arquivo são
 *    removidas, junto das parcelas futuras que elas projetaram (sourceMonth <= M).
 * 2. Compras do arquivo são atualizadas em M (mantendo apelido, categoria e pessoa)
 *    ou criadas.
 * 3. Uma parcela n/N projeta as parcelas seguintes nos meses M+1 até M+(N-n), mas
 *    para antes do primeiro mês posterior que tenha upload próprio: daquele mês em
 *    diante, quem decide é o upload dele (inclusive compras que ele removeu). Uma
 *    projeção também nunca sobrescreve linhas gravadas por uploads de meses > M.
 * 4. Linhas novas herdam apelido, categoria e pessoa de outra parcela da mesma compra.
 */

const MAX_DESCRIPTION_LENGTH = 200;

export type KeyedTransaction = ParsedCardTransaction & {
    purchaseKey: string;
};

export type ExistingCardExpense = Pick<
    CardExpense,
    'id' | 'month' | 'sourceMonth' | 'purchaseKey' | 'nickname' | 'categoryId' | 'personId'
>;

export type CardExpenseBankData = {
    transactionDate: Date;
    originalDescription: string;
    holderName: string | null;
    cardLastDigits: string | null;
    amountCents: bigint;
    installmentNumber: number | null;
    installmentTotal: number | null;
    sourceMonth: Date;
    importId: string;
};

export type NewCardExpense = CardExpenseBankData & {
    cardId: string;
    month: Date;
    purchaseKey: string;
    nickname: string | null;
    categoryId: string;
    personId: string | null;
};

export type CardImportPlan = {
    deleteIds: string[];
    updates: { id: string; data: CardExpenseBankData }[];
    creates: NewCardExpense[];
    summary: {
        created: number;
        updated: number;
        removed: number;
        projected: number;
    };
};

export type PlanCardImportInput = {
    cardId: string;
    importId: string;
    month: Date;
    transactions: KeyedTransaction[];
    /** Todas as linhas do cartão cujas chaves aparecem no arquivo ou no mês M. */
    existing: ExistingCardExpense[];
    /** Primeiro mês posterior a M com upload próprio no cartão; as projeções param antes dele. */
    nextImportedMonth: Date | null;
    defaultCategoryId: string;
};

/**
 * Identifica a compra (não a parcela), para reconhecê-la em outros uploads:
 * - parcelada: descrição + total de parcelas + mês de origem (M - (n - 1));
 * - à vista: descrição + data + valor.
 * Repetições idênticas no mesmo arquivo recebem os sufixos #2, #3...
 */
export function assignPurchaseKeys(transactions: ParsedCardTransaction[], month: Date): KeyedTransaction[] {
    const occurrences = new Map<string, number>();

    return transactions.map(transaction => {
        const description = transaction.description.slice(0, MAX_DESCRIPTION_LENGTH);
        const descriptionKey = description.toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ').trim();
        const baseKey = transaction.installmentNumber !== null && transaction.installmentTotal !== null
            ? [
                'P',
                formatMonth(addMonths(month, -(transaction.installmentNumber - 1))),
                transaction.installmentTotal,
                descriptionKey
            ].join('|')
            : ['S', transaction.transactionDate, transaction.amountCents.toString(), descriptionKey].join('|');
        const occurrence = (occurrences.get(baseKey) ?? 0) + 1;

        occurrences.set(baseKey, occurrence);

        return {
            ...transaction,
            description,
            purchaseKey: occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`
        };
    });
}

export function planCardImport(input: PlanCardImportInput): CardImportPlan {
    const { month } = input;
    const monthTime = month.getTime();
    const byKeyAndMonth = new Map<string, ExistingCardExpense>();
    const latestByKey = new Map<string, ExistingCardExpense>();

    for (const row of input.existing) {
        byKeyAndMonth.set(slot(row.purchaseKey, row.month), row);

        const latest = latestByKey.get(row.purchaseKey);

        if (!latest || row.month.getTime() > latest.month.getTime()) {
            latestByKey.set(row.purchaseKey, row);
        }
    }

    const fileKeys = new Set(input.transactions.map(transaction => transaction.purchaseKey));
    const missingKeys = new Set(
        input.existing
            .filter(row => row.month.getTime() === monthTime && !fileKeys.has(row.purchaseKey))
            .map(row => row.purchaseKey)
    );
    const deleteIds = input.existing
        .filter(row =>
            missingKeys.has(row.purchaseKey)
            && row.month.getTime() >= monthTime
            && row.sourceMonth.getTime() <= monthTime
        )
        .map(row => row.id);
    const deleted = new Set(deleteIds);
    const plan: CardImportPlan = {
        deleteIds,
        updates: [],
        creates: [],
        summary: { created: 0, updated: 0, removed: deleteIds.length, projected: 0 }
    };

    for (const transaction of input.transactions) {
        const remaining = transaction.installmentNumber !== null && transaction.installmentTotal !== null
            ? transaction.installmentTotal - transaction.installmentNumber
            : 0;

        for (let offset = 0; offset <= remaining; offset++) {
            const targetMonth = addMonths(month, offset);

            if (input.nextImportedMonth && targetMonth.getTime() >= input.nextImportedMonth.getTime()) {
                break;
            }

            const current = byKeyAndMonth.get(slot(transaction.purchaseKey, targetMonth));

            if (offset > 0 && current && current.sourceMonth.getTime() > monthTime) {
                continue;
            }

            const data: CardExpenseBankData = {
                transactionDate: new Date(`${transaction.transactionDate}T00:00:00.000Z`),
                originalDescription: transaction.description,
                holderName: transaction.holderName,
                cardLastDigits: transaction.cardLastDigits,
                amountCents: transaction.amountCents,
                installmentNumber: transaction.installmentNumber === null ? null : transaction.installmentNumber + offset,
                installmentTotal: transaction.installmentTotal,
                sourceMonth: month,
                importId: input.importId
            };

            if (current && !deleted.has(current.id)) {
                plan.updates.push({ id: current.id, data });
            } else {
                const source = latestByKey.get(transaction.purchaseKey);

                plan.creates.push({
                    ...data,
                    cardId: input.cardId,
                    month: targetMonth,
                    purchaseKey: transaction.purchaseKey,
                    nickname: source?.nickname ?? null,
                    categoryId: source?.categoryId ?? input.defaultCategoryId,
                    personId: source ? source.personId : null
                });
            }

            if (offset > 0) {
                plan.summary.projected++;
            } else if (current) {
                plan.summary.updated++;
            } else {
                plan.summary.created++;
            }
        }
    }

    return plan;
}

function slot(purchaseKey: string, month: Date): string {
    return `${purchaseKey}@${formatMonth(month)}`;
}
