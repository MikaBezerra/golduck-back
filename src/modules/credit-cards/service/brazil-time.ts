/*
 * Datas de compra no horário de Brasília. Desde 2019 não há horário de verão, então o fuso é sempre
 * UTC−3: uma compra às 22h31 de 22/10 chega como 2026-10-23T01:31Z e precisa contar como 22/10.
 */

const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Dia (meia-noite UTC) em que o instante cai no horário de Brasília. */
export function brazilDay(instant: Date): Date {
    const shifted = new Date(instant.getTime() - BRAZIL_OFFSET_MS);

    return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Hoje, no horário de Brasília. */
export function todayInBrazil(now: Date = new Date()): Date {
    return brazilDay(now);
}
