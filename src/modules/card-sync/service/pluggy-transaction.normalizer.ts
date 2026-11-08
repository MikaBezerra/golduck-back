import { CardBank } from '../../../generated/prisma/client.js';
import { brazilDay } from '../../credit-cards/service/brazil-time.js';
import { PluggyTransaction } from '../pluggy/pluggy-client.js';

/*
 * Converte as transações do cartão vindas da Pluggy no formato do Golduck. Diferenças por banco
 * (vistas nos dados reais de C6, Nubank e Neon):
 *
 * - C6: descrição com largura fixa, "ESTABELECIMENTO (22) CIDADE (13) PAÍS (3)"; fica só o estabelecimento,
 *   como no CSV do banco. Cada parcela chega no mês em que é lançada.
 * - Neon: largura fixa "ESTABELECIMENTO (25) CIDADE (13) PAÍS (2)" nas compras à vista; nas parceladas, a
 *   descrição termina em " 1/5". Só a primeira parcela chega: as outras são lançadas pela sincronização.
 * - Nubank: a descrição termina em " 4/8" nas parcelas; chegam todas, inclusive as futuras.
 *
 * Pagamentos da fatura e estornos ficam de fora (como no upload). Compras em outra moeda usam o valor
 * em reais. As datas são convertidas para o horário de Brasília.
 */

export type SyncedTransaction = {
    externalId: string;
    /** Dia do lançamento: decide a fatura. */
    postedDate: Date;
    /** Dia da compra original (nas parcelas, a da primeira). */
    purchaseDate: Date;
    description: string;
    amountCents: bigint;
    /** null = compra à vista. */
    installmentNumber: number | null;
    installmentTotal: number | null;
    cardLastDigits: string | null;
    /** Fatura informada pelo banco (só depois que ela vence). */
    billId: string | null;
    /** Ordem estável para numerar compras idênticas (#2, #3...). */
    order: string;
};

export type NormalizedTransactions = {
    transactions: SyncedTransaction[];
    /** Pagamentos da fatura, estornos e créditos. */
    ignoredCount: number;
};

const IGNORED_OPERATIONS = new Set(['PAGAMENTO_FATURA', 'ESTORNO']);
const INSTALLMENT_SUFFIX = /\s+(\d{1,2})\/(\d{1,2})$/;
const C6_FIXED_WIDTH = /^(.{22}) .{13} [A-Z]{3}$/;
const NEON_FIXED_WIDTH = /^(.{25}).{13}[A-Z]{2}$/;
const CARD_DIGITS = /^\d{4}$/;

export function normalizePluggyTransactions(bank: CardBank, transactions: PluggyTransaction[]): NormalizedTransactions {
    const normalized: SyncedTransaction[] = [];
    let ignoredCount = 0;

    for (const transaction of transactions) {
        const amountCents = toCents(transaction);

        if (amountCents === null || IGNORED_OPERATIONS.has(transaction.operationType ?? '')) {
            ignoredCount++;
            continue;
        }

        const metadata = transaction.creditCardMetadata ?? {};
        const installment = readInstallment(transaction);
        const postedDate = brazilDay(new Date(transaction.date));
        const cardNumber = metadata.cardNumber ?? '';

        normalized.push({
            externalId: transaction.id,
            postedDate,
            purchaseDate: installment && metadata.purchaseDate ? brazilDay(new Date(metadata.purchaseDate)) : postedDate,
            description: cleanDescription(bank, transaction.description),
            amountCents,
            installmentNumber: installment?.number ?? null,
            installmentTotal: installment?.total ?? null,
            cardLastDigits: CARD_DIGITS.test(cardNumber) && cardNumber !== '0000' ? cardNumber : null,
            billId: metadata.billId ?? null,
            order: `${transaction.date}|${transaction.id}`
        });
    }

    return { transactions: normalized, ignoredCount };
}

/** Valor em centavos, em reais; null para pagamentos, créditos e valores que faltam. */
function toCents(transaction: PluggyTransaction): bigint | null {
    const isBrl = (transaction.currencyCode ?? 'BRL') === 'BRL';
    const amount = isBrl ? transaction.amount : transaction.amountInAccountCurrency;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return BigInt(Math.round(amount * 100));
}

/** Parcela pelos campos da Pluggy ou, se faltarem, pelo " 4/8" no fim da descrição. */
function readInstallment(transaction: PluggyTransaction): { number: number; total: number } | null {
    const metadata = transaction.creditCardMetadata;
    const suffix = INSTALLMENT_SUFFIX.exec(transaction.description.trim());
    const number = metadata?.installmentNumber ?? (suffix ? Number(suffix[1]) : null);
    const total = metadata?.totalInstallments ?? (suffix ? Number(suffix[2]) : null);

    if (number === null || total === null || total < 2 || number < 1 || number > total) {
        return null;
    }

    return { number, total };
}

function cleanDescription(bank: CardBank, raw: string): string {
    let text = raw.replace(INSTALLMENT_SUFFIX, '');

    if (bank === CardBank.C6) {
        text = C6_FIXED_WIDTH.exec(text)?.[1] ?? text;
    } else if (bank === CardBank.NEON) {
        text = NEON_FIXED_WIDTH.exec(text)?.[1] ?? text;
    }

    return text.trim().replace(/\s+/g, ' ');
}
