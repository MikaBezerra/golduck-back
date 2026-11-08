import { formatMonth } from '../../common/date/month.js';
import { formatAmountCents } from '../../common/money/money.js';
import { splitEvenly } from './summary.calculator.js';

/*
 * Resumo do mês em tabela, uma coluna por pessoa, mais a quebra do líquido de cada uma. Função pura
 * (sem banco), em centavos (bigint). Usa as mesmas regras do resumo (summary.calculator.ts):
 *
 * - compartilhado = despesas sem pessoa (fora do cartão + do cartão) + reserva, dividido igualmente
 *   entre as pessoas ativas (os centavos que sobram vão para as primeiras em ordem alfabética);
 * - líquido compartilhado = entrada − compartilhado, dividido uma vez só (igual ao `share` do resumo);
 * - líquido individual = parte do líquido compartilhado − gastos individuais (igual ao `net`).
 *
 * As linhas do compartilhado (fixos, cartões, reserva) são divididas cada uma e depois ajustadas
 * (reconcile) para que a soma de cada pessoa bata exatamente com a divisão única.
 */

export type StatementPerson = {
    id: string;
    name: string;
    active: boolean;
};

export type StatementManualExpense = {
    id: string;
    title: string;
    amountCents: bigint;
    /** null = compartilhada. */
    personId: string | null;
};

/** Despesa do cartão já sem as excluídas. */
export type StatementCardExpense = {
    id: string;
    cardId: string;
    amountCents: bigint;
    personId: string | null;
};

export type StatementCard = {
    id: string;
    name: string;
};

/** Tudo o que a tabela de um mês precisa, já lido do banco. */
export type StatementSource = {
    /** Primeiro dia do mês, em UTC. */
    month: Date;
    /** null = sem entrada cadastrada no mês. */
    incomeCents: bigint | null;
    /** null = sem reserva no mês. */
    reserveCents: bigint | null;
    /** Soma de todas as reservas até o mês, inclusive. */
    reserveAccumulatedCents: bigint;
    /** Todas as pessoas (ativas e inativas). */
    people: StatementPerson[];
    manualExpenses: StatementManualExpense[];
    cardExpenses: StatementCardExpense[];
    cards: StatementCard[];
};

export type StatementRowStyle = 'item' | 'detail' | 'subtotal' | 'result' | 'highlight';

export type StatementColumn = {
    id: string;
    name: string;
    initial: string;
    /** Pessoa inativa com gasto individual no mês: não entra na divisão. */
    inactive: boolean;
};

export type StatementRow = {
    id: string;
    label: string;
    note: string | null;
    /** Coluna "Total"; null = não se aplica. */
    total: string | null;
    /** Um valor por coluna de pessoa; null = não se aplica. */
    cells: (string | null)[];
    /** Linhas que abrem ao clicar (cada despesa, cada cartão). */
    children: StatementRow[];
    style: StatementRowStyle;
};

export type StatementSection = {
    id: string;
    title: string;
    hint: string;
    rows: StatementRow[];
};

/**
 * Líquido de uma pessoa ativa em etapas:
 * beforeReserve − individual − reserve = net (o mesmo `net` do resumo, sem descontar a reserva duas vezes).
 */
export type StatementBreakdown = {
    personId: string;
    name: string;
    /** (entrada − despesas compartilhadas) dividido: o líquido antes da reserva e dos gastos individuais. */
    beforeReserve: string;
    /** Gastos individuais da pessoa no mês. */
    individual: string;
    /** A parte da pessoa na reserva do mês. */
    reserve: string;
    /** O que sobra para a pessoa; pode ser negativo. */
    net: string;
};

export type Statement = {
    month: string;
    columns: StatementColumn[];
    sections: StatementSection[];
    /** Uma linha por pessoa ativa, em ordem alfabética. */
    breakdown: StatementBreakdown[];
    reserve: {
        /** Quanto foi guardado no mês (todas as pessoas); null = sem reserva no mês. */
        month: string | null;
        /** Soma de todas as reservas até o mês, inclusive. */
        accumulated: string;
    };
    /** Há pessoas ativas para dividir o compartilhado. */
    hasPeople: boolean;
    incomeMissing: boolean;
};

type Cells = (bigint | null)[];

type RowValues = {
    total: bigint | null;
    cells: Cells;
    children?: StatementRow[];
    style?: StatementRowStyle;
};

export function buildStatement(source: StatementSource): Statement {
    const participants = source.people.filter(person => person.active).sort(compareByName);
    const individualIds = new Set(
        [...source.manualExpenses, ...source.cardExpenses]
            .map(expense => expense.personId)
            .filter((id): id is string => id !== null)
    );
    // Inativas só aparecem se tiverem gasto individual no mês (e não entram na divisão).
    const inactive = source.people.filter(person => !person.active && individualIds.has(person.id)).sort(compareByName);
    const people = [...participants, ...inactive];
    const columnOf = new Map(people.map((person, index) => [person.id, index]));
    const width = people.length;
    const count = participants.length;

    /** Valores das pessoas ativas viram células; as inativas ficam sem valor. */
    const toCells = (parts: bigint[]): Cells => people.map((_, index) => index < count ? parts[index] : null);
    const add = (left: Cells, right: Cells): Cells => left.map((value, index) =>
        value === null && right[index] === null ? null : (value ?? 0n) + (right[index] ?? 0n));
    const subtract = (left: Cells, right: Cells): Cells => left.map((value, index) =>
        value === null ? null : value - (right[index] ?? 0n));
    /** Cada despesa na coluna da sua pessoa. */
    const perPerson = (items: { amountCents: bigint; personId: string | null }[]): Cells => {
        const cells: Cells = people.map(() => 0n);

        for (const item of items) {
            const index = item.personId === null ? undefined : columnOf.get(item.personId);

            if (index !== undefined) {
                cells[index] = (cells[index] ?? 0n) + item.amountCents;
            }
        }

        return cells;
    };
    const onlyIn = (personId: string | null, cents: bigint): Cells => people.map(person => person.id === personId ? cents : null);
    const cardName = new Map(source.cards.map(card => [card.id, card.name]));
    const nameOfCard = (cardId: string): string => cardName.get(cardId) ?? 'Cartão';
    const byCard = (items: StatementCardExpense[]): [string, StatementCardExpense[]][] => {
        const groups = new Map<string, StatementCardExpense[]>();

        for (const item of items) {
            groups.set(item.cardId, [...groups.get(item.cardId) ?? [], item]);
        }

        return [...groups.entries()].sort(([first], [second]) => nameOfCard(first).localeCompare(nameOfCard(second), 'pt-BR'));
    };

    // ---------- Entrada ----------
    const incomeCents = source.incomeCents ?? 0n;
    const incomeParts = splitEvenly(incomeCents, count);
    const incomeRow = row('income', 'Entrada do mês', source.incomeCents === null ? 'não cadastrada' : null, {
        total: source.incomeCents,
        cells: source.incomeCents === null ? people.map(() => null) : toCells(incomeParts)
    });

    // ---------- Compartilhado ----------
    const sharedManual = source.manualExpenses.filter(expense => expense.personId === null);
    const sharedCard = source.cardExpenses.filter(expense => expense.personId === null);
    const reserveCents = source.reserveCents ?? 0n;
    const sharedManualCents = sum(sharedManual);
    const sharedCardCents = sum(sharedCard);
    const sharedTotal = sharedManualCents + sharedCardCents + reserveCents;
    // Divide (entrada − compartilhado) uma vez só; o compartilhado de cada um é o que falta para bater.
    const netSharedParts = splitEvenly(incomeCents - sharedTotal, count);
    const sharedParts = incomeParts.map((part, index) => part - netSharedParts[index]);
    const [fixedSharedParts, cardSharedParts, reserveParts] = reconcile(
        [sharedManualCents, sharedCardCents, reserveCents].map(total => splitEvenly(total, count)),
        sharedParts
    );
    const sharedCells = toCells(sharedParts);

    const sharedSection: StatementSection = {
        id: 'shared',
        title: 'Compartilhado',
        hint: 'Dividido igualmente entre as pessoas ativas',
        rows: [
            row('shared-fixed', 'Gastos fixos', 'despesas fora do cartão', {
                total: sharedManualCents,
                cells: toCells(fixedSharedParts),
                children: byAmount(sharedManual).map(expense => detail(`shared-fixed-${expense.id}`, expense.title, expense.amountCents, width))
            }),
            row('shared-card', 'Cartões', 'compras compartilhadas', {
                total: sharedCardCents,
                cells: toCells(cardSharedParts),
                children: byCard(sharedCard).map(([cardId, items]) => detail(`shared-card-${cardId}`, nameOfCard(cardId), sum(items), width))
            }),
            row('reserve', 'Reserva', source.reserveCents === null ? 'não cadastrada' : 'guardado no mês', {
                total: reserveCents,
                cells: toCells(reserveParts)
            }),
            row('shared-total', 'Total compartilhado', null, { total: sharedTotal, cells: sharedCells, style: 'subtotal' })
        ]
    };

    // ---------- Individual ----------
    const individualManual = source.manualExpenses.filter(expense => expense.personId !== null);
    const individualCard = source.cardExpenses.filter(expense => expense.personId !== null);
    const individualCells = add(perPerson(individualManual), perPerson(individualCard));
    const individualTotal = sum(individualManual) + sum(individualCard);

    const individualSection: StatementSection = {
        id: 'individual',
        title: 'Individual',
        hint: 'Gastos com pessoa, cada um na sua coluna',
        rows: [
            row('individual-fixed', 'Gastos fixos', 'despesas fora do cartão', {
                total: sum(individualManual),
                cells: perPerson(individualManual),
                children: byAmount(individualManual).map(expense => row(`individual-fixed-${expense.id}`, expense.title, null, {
                    total: expense.amountCents,
                    cells: onlyIn(expense.personId, expense.amountCents),
                    style: 'detail'
                }))
            }),
            row('individual-card', 'Cartões', 'compras individuais', {
                total: sum(individualCard),
                cells: perPerson(individualCard),
                children: byCard(individualCard).map(([cardId, items]) => row(`individual-card-${cardId}`, nameOfCard(cardId), null, {
                    total: sum(items),
                    cells: perPerson(items).map(cents => cents === 0n ? null : cents),
                    style: 'detail'
                }))
            }),
            row('individual-total', 'Total individual', null, { total: individualTotal, cells: individualCells, style: 'subtotal' })
        ]
    };

    // ---------- Resultado ----------
    const netSharedCells = toCells(netSharedParts);
    const netIndividualCells = subtract(netSharedCells, individualCells);
    const netIndividualTotal = netIndividualCells.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);

    const resultSection: StatementSection = {
        id: 'result',
        title: 'Resultado',
        hint: 'O que sobra para cada um',
        rows: [
            row('spent', 'Total de gastos', 'compartilhado + individual', {
                total: sharedTotal + individualTotal,
                cells: add(sharedCells, individualCells),
                style: 'subtotal'
            }),
            row('net-shared', 'Líquido compartilhado', 'entrada − compartilhado', {
                total: incomeCents - sharedTotal,
                cells: netSharedCells,
                style: 'result'
            }),
            row('net-individual', 'Líquido individual', 'parte − gastos individuais', {
                total: count > 0 ? netIndividualTotal : incomeCents - sharedTotal - individualTotal,
                cells: netIndividualCells,
                style: 'highlight'
            })
        ]
    };

    return {
        month: formatMonth(source.month),
        columns: people.map(person => ({
            id: person.id,
            name: person.name,
            initial: person.name.charAt(0).toUpperCase(),
            inactive: !person.active
        })),
        sections: [
            { id: 'income', title: 'Entrada', hint: 'Dividida igualmente entre as pessoas ativas', rows: [incomeRow] },
            sharedSection,
            individualSection,
            resultSection
        ],
        breakdown: participants.map((person, index) => {
            const individual = individualCells[index] ?? 0n;

            return {
                personId: person.id,
                name: person.name,
                beforeReserve: formatAmountCents(netSharedParts[index] + reserveParts[index]),
                individual: formatAmountCents(individual),
                reserve: formatAmountCents(reserveParts[index]),
                net: formatAmountCents(netSharedParts[index] - individual)
            };
        }),
        reserve: {
            month: source.reserveCents === null ? null : formatAmountCents(source.reserveCents),
            accumulated: formatAmountCents(source.reserveAccumulatedCents)
        },
        hasPeople: count > 0,
        incomeMissing: source.incomeCents === null
    };
}

/**
 * Ajusta a divisão de cada linha para que a soma de cada pessoa seja `targets`. A diferença (no máximo
 * poucos centavos) vai para a linha que fica mais equilibrada; no empate, a de maior valor. Como as
 * diferenças somam zero, o total de cada linha não muda.
 */
export function reconcile(rows: bigint[][], targets: bigint[]): bigint[][] {
    const result = rows.map(parts => [...parts]);

    if (result.length === 0 || targets.length === 0) {
        return result;
    }

    const differences = targets.map((target, person) => target - result.reduce((total, parts) => total + parts[person], 0n));
    const adjusted = (parts: bigint[]): bigint[] => parts.map((part, person) => part + differences[person]);
    const spread = (parts: bigint[]): bigint => parts.reduce((max, part) => part > max ? part : max)
        - parts.reduce((min, part) => part < min ? part : min);
    const size = (parts: bigint[]): bigint => {
        const total = parts.reduce((acc, part) => acc + part, 0n);

        return total < 0n ? -total : total;
    };
    const chosen = result.reduce((best, parts, index) => {
        const current = spread(adjusted(parts));
        const bestSpread = spread(adjusted(result[best]));

        return current < bestSpread || (current === bestSpread && size(parts) > size(result[best])) ? index : best;
    }, 0);

    result[chosen] = adjusted(result[chosen]);

    return result;
}

function compareByName(first: StatementPerson, second: StatementPerson): number {
    return first.name.localeCompare(second.name, 'pt-BR') || first.id.localeCompare(second.id);
}

function sum(items: { amountCents: bigint }[]): bigint {
    return items.reduce((total, item) => total + item.amountCents, 0n);
}

function byAmount<T extends { amountCents: bigint }>(items: T[]): T[] {
    return [...items].sort((first, second) => second.amountCents > first.amountCents ? 1 : second.amountCents < first.amountCents ? -1 : 0);
}

function row(id: string, label: string, note: string | null, values: RowValues): StatementRow {
    return {
        id,
        label,
        note,
        total: values.total === null ? null : formatAmountCents(values.total),
        cells: values.cells.map(cents => cents === null ? null : formatAmountCents(cents)),
        children: values.children ?? [],
        style: values.style ?? 'item'
    };
}

/** Detalhe de um gasto compartilhado: só o total (a divisão já aparece na linha de cima). */
function detail(id: string, label: string, cents: bigint, width: number): StatementRow {
    return row(id, label, null, { total: cents, cells: Array.from({ length: width }, () => null), style: 'detail' });
}
