import type { PluggyTransaction } from '../pluggy/pluggy-client.js';

/*
 * Transações no formato que a Pluggy devolve, copiado dos dados reais de C6, Nubank e Neon, mas com
 * estabelecimentos, valores e ids inventados (nunca uma fatura real).
 */

let sequence = 0;

/** Uma transação de cartão; date em UTC, como a Pluggy manda. */
export function pluggyTransaction(data: Partial<PluggyTransaction> & Pick<PluggyTransaction, 'description' | 'amount' | 'date'>): PluggyTransaction {
    sequence++;

    return {
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        currencyCode: 'BRL',
        amountInAccountCurrency: null,
        status: 'PENDING',
        type: 'DEBIT',
        operationType: 'PAGAMENTO',
        creditCardMetadata: null,
        ...data
    };
}

/** Descrição do C6: estabelecimento (22), cidade (13) e país (3), separados por um espaço. */
export function c6Description(merchant: string, city = 'ARACAJU', country = 'BRA'): string {
    return `${merchant.padEnd(22).slice(0, 22)} ${city.padEnd(13).slice(0, 13)} ${country}`;
}

/** Descrição do Neon à vista: estabelecimento (25), cidade (13) e país (2), sem separador. */
export function neonDescription(merchant: string, city = 'CARUARU', country = 'BR'): string {
    return `${merchant.padEnd(25).slice(0, 25)}${city.padEnd(13).slice(0, 13)}${country}`;
}
