import { addMonths } from '../../common/date/month.js';

/*
 * Em que mês cai cada parcela de uma compra. Vale para "Adicionar compra", para a correção feita
 * pelo usuário (mover de mês ou de parcela) e para a sincronização, que respeita essa correção.
 */

/** A parcela installmentNumber fica em month; as outras seguem, uma por mês. */
export type PurchaseAnchor = {
    installmentNumber: number;
    month: Date;
    /** null = compra à vista. */
    installmentTotal: number | null;
};

export type ScheduledInstallment = {
    /** null = compra à vista. */
    installmentNumber: number | null;
    month: Date;
};

/** Todas as parcelas da compra (1 até o total), cada uma no seu mês. */
export function scheduleInstallments(anchor: PurchaseAnchor): ScheduledInstallment[] {
    if (anchor.installmentTotal === null) {
        return [{ installmentNumber: null, month: anchor.month }];
    }

    return Array.from({ length: anchor.installmentTotal }, (_, index) => ({
        installmentNumber: index + 1,
        month: addMonths(anchor.month, index + 1 - anchor.installmentNumber)
    }));
}
