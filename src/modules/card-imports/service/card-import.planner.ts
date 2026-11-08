import type { CardExpense } from '../../../generated/prisma/client.js';
import type { SplitAssignment } from '../../common/expense-split/expense-split.js';
import type { ParsedCardTransaction } from '../parsers/card-statement.parser.js';
import { addMonths, formatMonth } from '../../common/date/month.js';
import { PENDING_SPLIT } from '../../common/expense-split/expense-split.js';

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
 * 5. Uma escolha do usuário (override) para uma compra vale para todas as linhas que
 *    o upload grava dela: a do mês e as parcelas projetadas, criadas ou atualizadas.
 * 6. A exclusão (suave) é mantida nas atualizações e herdada pelas linhas novas, como
 *    a personalização. Decisões de excluir/restaurar no salvamento são aplicadas pelo
 *    repositório depois do plano, porque podem alcançar meses que o upload não grava.
 *
 * O plano não conhece o upload (CardImport): o repositório acrescenta o importId ao
 * gravar. Assim o mesmo plano serve para a pré-visualização, que não grava nada.
 */

const MAX_DESCRIPTION_LENGTH = 200;

export type KeyedTransaction = ParsedCardTransaction & {
    purchaseKey: string;
};

export type ExistingCardExpense = Pick<
    CardExpense,
    'id' | 'month' | 'sourceMonth' | 'purchaseKey' | 'nickname' | 'categoryId' | 'split' | 'personId'
    | 'excludedAt' | 'exclusionRemembered'
>;

/** Estado de exclusão de uma linha. */
export type CardExpenseExclusionState = Pick<CardExpense, 'excludedAt' | 'exclusionRemembered'>;

/** O que o usuário escolhe para uma despesa: apelido, categoria e pessoa (split). */
export type CardExpensePersonalization = SplitAssignment & {
    nickname: string | null;
    categoryId: string;
};

export type CardExpenseBankData = {
    transactionDate: Date;
    originalDescription: string;
    holderName: string | null;
    cardLastDigits: string | null;
    amountCents: bigint;
    installmentNumber: number | null;
    installmentTotal: number | null;
    sourceMonth: Date;
};

export type CardExpenseUpdate = {
    id: string;
    /** Dados do banco; apelido, categoria e pessoa só entram quando há override. */
    data: CardExpenseBankData & Partial<CardExpensePersonalization>;
};

export type NewCardExpense = CardExpenseBankData & CardExpensePersonalization & CardExpenseExclusionState & {
    cardId: string;
    month: Date;
    purchaseKey: string;
};

export type PlannedTransaction = {
    transaction: KeyedTransaction;
    /** "new": a compra ainda não existe no mês; "update": já existe e será atualizada. */
    status: 'new' | 'update';
    /** Apelido, categoria e pessoa que o upload grava na linha do mês sem override. */
    suggestion: CardExpensePersonalization;
    /** Parcelas futuras que esta linha lança (criadas ou atualizadas). */
    projectedCount: number;
    /** A linha do mês fica excluída se o upload for salvo sem decisão. */
    excluded: boolean;
    /** Excluída e sem "não perguntar de novo": o front deve perguntar o que fazer. */
    askExclusion: boolean;
};

export type CardImportPlan = {
    deleteIds: string[];
    updates: CardExpenseUpdate[];
    creates: NewCardExpense[];
    transactions: PlannedTransaction[];
    summary: {
        created: number;
        updated: number;
        removed: number;
        projected: number;
    };
};

export type PlanCardImportInput = {
    cardId: string;
    month: Date;
    transactions: KeyedTransaction[];
    /** Todas as linhas do cartão cujas chaves aparecem no arquivo ou no mês M. */
    existing: ExistingCardExpense[];
    /** Primeiro mês posterior a M com upload próprio no cartão; as projeções param antes dele. */
    nextImportedMonth: Date | null;
    defaultCategoryId: string;
    /** Escolhas do usuário por purchaseKey. */
    overrides?: ReadonlyMap<string, CardExpensePersonalization>;
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
        transactions: [],
        summary: { created: 0, updated: 0, removed: deleteIds.length, projected: 0 }
    };

    for (const transaction of input.transactions) {
        const remaining = transaction.installmentNumber !== null && transaction.installmentTotal !== null
            ? transaction.installmentTotal - transaction.installmentNumber
            : 0;
        const source = latestByKey.get(transaction.purchaseKey);
        const inherited: CardExpensePersonalization = {
            nickname: source?.nickname ?? null,
            categoryId: source?.categoryId ?? input.defaultCategoryId,
            // Compra nova no arquivo: pendente até alguém escolher a pessoa.
            ...(source ? { split: source.split, personId: source.personId } : PENDING_SPLIT)
        };
        const inheritedExclusion: CardExpenseExclusionState = {
            excludedAt: source?.excludedAt ?? null,
            exclusionRemembered: source?.exclusionRemembered ?? false
        };
        const override = input.overrides?.get(transaction.purchaseKey);
        const monthRow = byKeyAndMonth.get(slot(transaction.purchaseKey, month));
        const monthExclusion = monthRow ?? inheritedExclusion;
        let projectedCount = 0;

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
                sourceMonth: month
            };

            if (current && !deleted.has(current.id)) {
                plan.updates.push({ id: current.id, data: override ? { ...data, ...override } : data });
            } else {
                plan.creates.push({
                    ...data,
                    ...(override ?? inherited),
                    ...inheritedExclusion,
                    cardId: input.cardId,
                    month: targetMonth,
                    purchaseKey: transaction.purchaseKey
                });
            }

            if (offset > 0) {
                projectedCount++;
                plan.summary.projected++;
            } else if (current) {
                plan.summary.updated++;
            } else {
                plan.summary.created++;
            }
        }

        plan.transactions.push({
            transaction,
            status: monthRow ? 'update' : 'new',
            suggestion: monthRow
                ? { nickname: monthRow.nickname, categoryId: monthRow.categoryId, split: monthRow.split, personId: monthRow.personId }
                : inherited,
            projectedCount,
            excluded: monthExclusion.excludedAt !== null,
            askExclusion: monthExclusion.excludedAt !== null && !monthExclusion.exclusionRemembered
        });
    }

    return plan;
}

function slot(purchaseKey: string, month: Date): string {
    return `${purchaseKey}@${formatMonth(month)}`;
}
