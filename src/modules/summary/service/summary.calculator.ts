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

/** Entrada e despesas de um mês, agrupadas por categoria e por pessoa. */
export type MonthGroups = {
    incomeCents: bigint | null;
    manualByCategory: AmountGroup[];
    manualByPerson: AmountGroup[];
    cardByCategory: AmountGroup[];
    cardByPerson: AmountGroup[];
};

export type Total = {
    amountCents: bigint;
    count: number;
};

/** Resultado de um período (um mês ou a soma de vários). */
export type PeriodTotals = {
    /** null quando nenhum mês do período tem entrada cadastrada. */
    incomeCents: bigint | null;
    manual: Total;
    card: Total;
    expensesCents: bigint;
    expensesCount: number;
    balanceCents: bigint;
    byCategory: AmountGroup[];
    byPerson: AmountGroup[];
    nets: ParticipantNet[];
};

/** Calcula um mês: totais, saldo e o líquido de cada pessoa ativa. */
export function computeMonth(groups: MonthGroups, participants: Participant[]): PeriodTotals {
    const manual = sumGroups(groups.manualByCategory);
    const card = sumGroups(groups.cardByCategory);
    const byPerson = mergeGroups(groups.manualByPerson, groups.cardByPerson);
    const expensesCents = manual.amountCents + card.amountCents;
    const incomeCents = groups.incomeCents ?? 0n;
    const sharedCents = byPerson.find(group => group.key === null)?.amountCents ?? 0n;
    const individualByPerson = new Map(
        byPerson.filter(group => group.key !== null).map(group => [group.key as string, group.amountCents])
    );

    return {
        incomeCents: groups.incomeCents,
        manual,
        card,
        expensesCents,
        expensesCount: manual.count + card.count,
        balanceCents: incomeCents - expensesCents,
        byCategory: mergeGroups(groups.manualByCategory, groups.cardByCategory),
        byPerson,
        nets: netByParticipant(incomeCents, sharedCents, participants, individualByPerson)
    };
}

/**
 * Soma vários meses. O líquido de cada pessoa é a soma dos líquidos mensais, para o
 * período sempre bater com os meses (inclusive nos centavos distribuídos).
 */
export function combinePeriods(periods: PeriodTotals[], participants: Participant[]): PeriodTotals {
    const incomes = periods.map(period => period.incomeCents).filter((income): income is bigint => income !== null);
    const sum = (pick: (period: PeriodTotals) => bigint): bigint => periods.reduce((total, period) => total + pick(period), 0n);
    const sumTotals = (pick: (period: PeriodTotals) => Total): Total => ({
        amountCents: sum(period => pick(period).amountCents),
        count: periods.reduce((total, period) => total + pick(period).count, 0)
    });
    const ordered = [...participants].sort(compareParticipants);

    return {
        incomeCents: incomes.length === 0 ? null : incomes.reduce((total, income) => total + income, 0n),
        manual: sumTotals(period => period.manual),
        card: sumTotals(period => period.card),
        expensesCents: sum(period => period.expensesCents),
        expensesCount: periods.reduce((total, period) => total + period.expensesCount, 0),
        balanceCents: sum(period => period.balanceCents),
        byCategory: mergeGroups(...periods.map(period => period.byCategory)),
        byPerson: mergeGroups(...periods.map(period => period.byPerson)),
        nets: ordered.map(participant => {
            const items = periods.flatMap(period => period.nets.filter(net => net.participant.id === participant.id));
            const total = (pick: (net: ParticipantNet) => bigint): bigint => items.reduce((acc, net) => acc + pick(net), 0n);

            return {
                participant,
                shareCents: total(net => net.shareCents),
                individualCents: total(net => net.individualCents),
                netCents: total(net => net.netCents)
            };
        })
    };
}

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
