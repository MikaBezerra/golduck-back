import type { CardBank } from '../../../generated/prisma/client.js';

export type StatementMonth = {
    year: number;
    month: number;
};

export type ParsedCardTransaction = {
    /** Data informada pelo banco, no formato AAAA-MM-DD. */
    transactionDate: string;
    description: string;
    /** Sempre positivo: créditos, pagamentos e estornos são descartados pelo parser. */
    amountCents: bigint;
    installmentNumber: number | null;
    installmentTotal: number | null;
    holderName: string | null;
    cardLastDigits: string | null;
};

export type CardStatementParseResult = {
    transactions: ParsedCardTransaction[];
    ignoredCount: number;
};

export type CardStatementParseInput = {
    file: Buffer;
    month: StatementMonth;
    password?: string;
};

export interface CardStatementParser {
    readonly bank: CardBank;
    readonly version: string;
    readonly fileExtension: '.csv' | '.pdf';

    parse(input: CardStatementParseInput): CardStatementParseResult | Promise<CardStatementParseResult>;
}

/** O arquivo não segue o formato esperado para o banco escolhido. */
export class CardStatementFormatError extends Error {
    public constructor(public readonly reason: string) {
        super(reason);
        this.name = 'CardStatementFormatError';
    }
}

/** O arquivo é protegido e a senha está ausente ou incorreta. */
export class CardStatementPasswordError extends Error {
    public constructor(public readonly reason: string) {
        super(reason);
        this.name = 'CardStatementPasswordError';
    }
}

const MAX_INSTALLMENTS = 99;

/**
 * Converte valores como "1.981,55", "- 1.981,55" (formato brasileiro)
 * ou "-4094.96" (ponto decimal) em centavos com sinal.
 */
export function parseSignedAmountCents(raw: string, decimalSeparator: ',' | '.'): bigint | null {
    let text = raw.replace(/\s+/g, '').replace(/^R\$/, '');
    let negative = false;

    if (text.startsWith('-')) {
        negative = true;
        text = text.slice(1).replace(/^R\$/, '');
    }

    if (decimalSeparator === ',') {
        if (!/^\d{1,3}(?:\.?\d{3})*(?:,\d{1,2})?$/.test(text)) {
            return null;
        }

        text = text.replace(/\./g, '').replace(',', '.');
    } else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
        return null;
    }

    const [whole, fraction = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));

    return negative ? -cents : cents;
}

export function parseInstallment(raw: string): { number: number; total: number } | null {
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(raw.trim());

    if (!match) {
        return null;
    }

    const installmentNumber = Number(match[1]);
    const total = Number(match[2]);

    if (installmentNumber < 1 || total < 1 || installmentNumber > total || total > MAX_INSTALLMENTS) {
        return null;
    }

    return { number: installmentNumber, total };
}

export function toIsoDate(year: number, month: number, day: number): string | null {
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }

    return date.toISOString().slice(0, 10);
}

export function normalizeDescription(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}
