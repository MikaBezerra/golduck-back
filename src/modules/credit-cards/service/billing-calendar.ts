import { addMonths, formatMonth } from '../../common/date/month.js';

/*
 * Ciclo da fatura. A fatura recebe o nome do mês em que vence (a aberta hoje, paga no mês que vem,
 * é a do mês que vem). O que separa uma fatura da seguinte é o "melhor dia de compra": compras
 * a partir dele já vão para a fatura seguinte. Ele varia de mês a mês, então vale, nesta ordem:
 *
 * 1. o fechamento informado pelo banco (só existe depois que a fatura fecha);
 * 2. o melhor dia que o usuário ajustou para aquela fatura;
 * 3. o melhor dia padrão do cartão.
 *
 * Todas as datas são dias (meia-noite UTC), já no horário de Brasília.
 */

/** Configuração do cartão: dia do vencimento e melhor dia de compra padrão (1 a 31). */
export type BillingSettings = {
    dueDay: number;
    bestPurchaseDay: number;
};

/** O que está gravado de uma fatura (CardBill). */
export type StoredBill = {
    month: Date;
    bestPurchaseDate: Date | null;
    bankClosingDate: Date | null;
    bankDueDate: Date | null;
};

/** De onde veio o melhor dia da fatura. */
export type BillBoundarySource = 'bank' | 'user' | 'default';

export type BillSchedule = {
    month: Date;
    /** Primeiro dia cuja compra já vai para a fatura seguinte. */
    bestPurchaseDate: Date;
    /** Último dia de compra que entra nesta fatura. */
    closingDate: Date;
    dueDate: Date;
    source: BillBoundarySource;
    /** O ajuste do usuário, mesmo quando o fechamento do banco prevalece. */
    userBestPurchaseDate: Date | null;
};

const DAY_MS = 86_400_000;

/**
 * O fechamento do banco (billClosingDate da Pluggy) é o último dia de compra da fatura: o melhor dia
 * é o dia seguinte.
 */
const BANK_CLOSING_IS_LAST_PURCHASE_DAY = true;

/** Dia do mês, limitado ao último dia (31 em fevereiro vira 28 ou 29). */
export function dayInMonth(month: Date, day: number): Date {
    const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();

    return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(day, lastDay)));
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}

/** Primeiro dia do mês da data. */
export function monthOf(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export class BillingCalendar {
    private readonly bills = new Map<string, StoredBill>();

    public constructor(private readonly settings: BillingSettings, bills: StoredBill[] = []) {
        for (const bill of bills) {
            this.bills.set(formatMonth(bill.month), bill);
        }
    }

    /**
     * Melhor dia padrão da fatura que vence em month: o dia configurado, no próprio mês quando vem
     * antes do vencimento (fecha dia 5, vence dia 15) ou no mês anterior (melhor dia 25, vence dia 1).
     */
    public defaultBestPurchaseDate(month: Date): Date {
        const sameMonth = this.settings.bestPurchaseDay < this.settings.dueDay;

        return dayInMonth(sameMonth ? month : addMonths(month, -1), this.settings.bestPurchaseDay);
    }

    public schedule(month: Date): BillSchedule {
        const stored = this.bills.get(formatMonth(month));
        let bestPurchaseDate: Date;
        let source: BillBoundarySource;

        if (stored?.bankClosingDate) {
            bestPurchaseDate = BANK_CLOSING_IS_LAST_PURCHASE_DAY ? addDays(stored.bankClosingDate, 1) : stored.bankClosingDate;
            source = 'bank';
        } else if (stored?.bestPurchaseDate) {
            bestPurchaseDate = stored.bestPurchaseDate;
            source = 'user';
        } else {
            bestPurchaseDate = this.defaultBestPurchaseDate(month);
            source = 'default';
        }

        return {
            month,
            bestPurchaseDate,
            closingDate: addDays(bestPurchaseDate, -1),
            dueDate: stored?.bankDueDate ?? dayInMonth(month, this.settings.dueDay),
            source,
            userBestPurchaseDate: stored?.bestPurchaseDate ?? null
        };
    }

    /** Fatura (mês do vencimento) em que cai uma compra feita no dia informado. */
    public billMonthOf(date: Date): Date {
        let month = addMonths(monthOf(date), -1);

        // O melhor dia de cada fatura fica entre o mês anterior ao vencimento e o próprio vencimento:
        // três tentativas a partir do mês anterior ao da compra sempre bastam.
        for (let attempt = 0; attempt < 3; attempt++) {
            if (date.getTime() < this.schedule(month).bestPurchaseDate.getTime()) {
                return month;
            }

            month = addMonths(month, 1);
        }

        return month;
    }
}
