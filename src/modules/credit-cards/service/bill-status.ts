import { monthOf } from './billing-calendar.js';

/*
 * Situação de uma fatura para quem paga as contas:
 *
 * - open: ainda recebe compras (antes do fechamento);
 * - closed: fechou e falta pagar;
 * - overdue: fechou, passou do vencimento e ninguém marcou como paga;
 * - paid: o usuário marcou como paga (vale sobre as outras).
 *
 * Sem o ciclo configurado no cartão (só upload de fatura), o fechamento é desconhecido: a fatura conta
 * como fechada a partir do mês do vencimento, e nunca como vencida.
 */

export type BillStatus = 'open' | 'closed' | 'overdue' | 'paid';

export const BILL_STATUSES: BillStatus[] = ['open', 'closed', 'overdue', 'paid'];

export type BillTiming = {
    /** Mês da fatura (o do vencimento). */
    month: Date;
    /** Último dia de compra da fatura; null quando o cartão não tem o ciclo configurado. */
    closingDate: Date | null;
    dueDate: Date | null;
};

/** A fatura já fechou no dia informado (hoje, no horário de Brasília). */
export function isBillClosed(bill: BillTiming, today: Date): boolean {
    if (bill.closingDate) {
        return today.getTime() > bill.closingDate.getTime();
    }

    return bill.month.getTime() <= monthOf(today).getTime();
}

export function resolveBillStatus(bill: BillTiming & { paidAt: Date | null }, today: Date): BillStatus {
    if (bill.paidAt) {
        return 'paid';
    }

    if (!isBillClosed(bill, today)) {
        return 'open';
    }

    return bill.dueDate && today.getTime() > bill.dueDate.getTime() ? 'overdue' : 'closed';
}
