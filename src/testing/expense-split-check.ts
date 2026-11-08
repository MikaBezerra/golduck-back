import type { ExpenseSplit } from '../generated/prisma/client.js';

/** split padrão das linhas montadas nos testes: com pessoa, individual; sem, compartilhada. */
export function splitFor(personId: string | null | undefined): ExpenseSplit {
    return personId ? 'PERSONAL' : 'SHARED';
}

/** Imita o CHECK do banco: personId só (e sempre) com split PERSONAL. */
export function assertSplitCheck(row: { split: ExpenseSplit; personId: string | null }): void {
    if ((row.split === 'PERSONAL') !== (row.personId !== null)) {
        throw new Error(`CHECK violado: split ${row.split} com personId ${String(row.personId)}`);
    }
}
