/** Converte "AAAA-MM" na data do primeiro dia do mês, em UTC. */
export function parseMonth(month: string): Date {
    const [year, monthNumber] = month.split('-').map(Number);

    return new Date(Date.UTC(year, monthNumber - 1, 1));
}

/** Formata a data como "AAAA-MM". */
export function formatMonth(date: Date): string {
    return date.toISOString().slice(0, 7);
}

/** Formata a data como "AAAA-MM-DD". */
export function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Soma (ou subtrai) meses a partir do primeiro dia do mês informado. */
export function addMonths(month: Date, amount: number): Date {
    return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}
