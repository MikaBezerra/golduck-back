/*
 * Contas do resumo mensal, todas em centavos (bigint) e sem banco de dados.
 *
 * Líquido individual: (E − C) / k − Dₚ, em que E é a entrada do mês, C o total das
 * despesas compartilhadas, k o número de pessoas ativas e Dₚ as despesas individuais
 * da pessoa. Quando E − C não divide exatamente por k, os centavos que sobram vão,
 * um a um, para as primeiras pessoas em ordem alfabética: a soma das partes é sempre
 * igual a E − C.
 */

export type AmountGroup = {
    /** categoryId ou personId; null = despesas sem pessoa (compartilhadas). */
    key: string | null;
    amountCents: bigint;
    count: number;
};

export type Participant = {
    id: string;
    name: string;
};

export type ParticipantNet = {
    participant: Participant;
    shareCents: bigint;
    individualCents: bigint;
    netCents: bigint;
};

/** Soma grupos com a mesma chave (por exemplo, despesas manuais + do cartão). */
export function mergeGroups(...lists: AmountGroup[][]): AmountGroup[] {
    const merged = new Map<string | null, AmountGroup>();

    for (const group of lists.flat()) {
        const current = merged.get(group.key);

        merged.set(group.key, current
            ? { key: group.key, amountCents: current.amountCents + group.amountCents, count: current.count + group.count }
            : { ...group });
    }

    return [...merged.values()];
}

export function sumGroups(groups: AmountGroup[]): { amountCents: bigint; count: number } {
    return groups.reduce(
        (total, group) => ({ amountCents: total.amountCents + group.amountCents, count: total.count + group.count }),
        { amountCents: 0n, count: 0 }
    );
}

/**
 * Divide o valor em k partes que somam exatamente o valor. Os centavos que sobram
 * (positivos ou negativos) vão para as primeiras partes.
 */
export function splitEvenly(amountCents: bigint, parts: number): bigint[] {
    if (parts <= 0) {
        return [];
    }

    const divisor = BigInt(parts);
    const base = amountCents / divisor;
    const remainder = amountCents - base * divisor;
    const step = remainder < 0n ? -1n : 1n;
    const extra = Number(remainder < 0n ? -remainder : remainder);

    return Array.from({ length: parts }, (_, index) => base + (index < extra ? step : 0n));
}

/** Líquido de cada pessoa ativa, na ordem alfabética usada para distribuir os centavos. */
export function netByParticipant(
    incomeCents: bigint,
    sharedCents: bigint,
    participants: Participant[],
    individualByPerson: ReadonlyMap<string, bigint>
): ParticipantNet[] {
    const ordered = [...participants].sort(compareParticipants);
    const shares = splitEvenly(incomeCents - sharedCents, ordered.length);

    return ordered.map((participant, index) => {
        const individualCents = individualByPerson.get(participant.id) ?? 0n;

        return {
            participant,
            shareCents: shares[index],
            individualCents,
            netCents: shares[index] - individualCents
        };
    });
}

/** Valor decrescente; empate por nome; sem nome (null) por último. */
export function compareByAmountThenName(
    first: { amountCents: bigint; name: string | null },
    second: { amountCents: bigint; name: string | null }
): number {
    if (first.amountCents !== second.amountCents) {
        return first.amountCents > second.amountCents ? -1 : 1;
    }

    if (first.name === null || second.name === null) {
        return first.name === second.name ? 0 : first.name === null ? 1 : -1;
    }

    return first.name.localeCompare(second.name, 'pt-BR');
}

function compareParticipants(first: Participant, second: Participant): number {
    return first.name.localeCompare(second.name, 'pt-BR') || first.id.localeCompare(second.id);
}
