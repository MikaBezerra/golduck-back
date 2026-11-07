import type { ParsedCardTransaction } from '../parsers/card-statement.parser';
import { parseMonth } from '../../common/date/month';
import {
    assignPurchaseKeys,
    ExistingCardExpense,
    KeyedTransaction,
    planCardImport
} from '../service/card-import.planner';

const CARD = 'card-1';
const DEFAULT_CATEGORY = 'cat-outros';

function transaction(overrides: Partial<ParsedCardTransaction>): ParsedCardTransaction {
    return {
        transactionDate: '2026-10-05',
        description: 'Loja',
        amountCents: 1000n,
        installmentNumber: null,
        installmentTotal: null,
        holderName: null,
        cardLastDigits: null,
        ...overrides
    };
}

function existing(overrides: Partial<ExistingCardExpense> & { purchaseKey: string; month: Date }): ExistingCardExpense {
    return {
        id: `${overrides.purchaseKey}@${overrides.month.toISOString().slice(0, 7)}`,
        sourceMonth: overrides.month,
        nickname: null,
        categoryId: DEFAULT_CATEGORY,
        personId: null,
        ...overrides
    };
}

function plan(
    month: string,
    transactions: KeyedTransaction[],
    rows: ExistingCardExpense[] = [],
    nextImportedMonth: string | null = null
) {
    return planCardImport({
        cardId: CARD,
        importId: 'import-1',
        month: parseMonth(month),
        transactions,
        existing: rows,
        nextImportedMonth: nextImportedMonth === null ? null : parseMonth(nextImportedMonth),
        defaultCategoryId: DEFAULT_CATEGORY
    });
}

describe('assignPurchaseKeys', () => {
    it('usa o mês de origem nas parcelas, para a mesma compra ter a mesma chave em meses diferentes', () => {
        const [october] = assignPurchaseKeys(
            [transaction({ description: 'Loja X', installmentNumber: 2, installmentTotal: 4, transactionDate: '2026-10-26' })],
            parseMonth('2026-10')
        );
        const [november] = assignPurchaseKeys(
            [transaction({ description: 'LOJA  x', installmentNumber: 3, installmentTotal: 4, transactionDate: '2026-11-26', amountCents: 1001n })],
            parseMonth('2026-11')
        );

        expect(october.purchaseKey).toBe('P|2026-09|4|LOJA X');
        expect(november.purchaseKey).toBe(october.purchaseKey);
    });

    it('diferencia compras à vista idênticas no mesmo arquivo com sufixo', () => {
        const keys = assignPurchaseKeys(
            [transaction({}), transaction({}), transaction({ amountCents: 2000n })],
            parseMonth('2026-10')
        ).map(item => item.purchaseKey);

        expect(keys).toEqual([
            'S|2026-10-05|1000|LOJA',
            'S|2026-10-05|1000|LOJA#2',
            'S|2026-10-05|2000|LOJA'
        ]);
    });
});

describe('planCardImport', () => {
    const october = parseMonth('2026-10');
    const november = parseMonth('2026-11');
    const december = parseMonth('2026-12');

    it('cria a parcela do mês e projeta as seguintes', () => {
        const items = assignPurchaseKeys([transaction({ installmentNumber: 1, installmentTotal: 3 })], october);
        const result = plan('2026-10', items);

        expect(result.creates.map(row => [row.month.toISOString().slice(0, 7), row.installmentNumber])).toEqual([
            ['2026-10', 1],
            ['2026-11', 2],
            ['2026-12', 3]
        ]);
        expect(result.summary).toEqual({ created: 1, updated: 0, removed: 0, projected: 2 });
        expect(result.creates.every(row => row.categoryId === DEFAULT_CATEGORY && row.personId === null)).toBe(true);
    });

    it('atualiza a projeção quando o CSV do mês seguinte chega, mantendo o ID', () => {
        const items = assignPurchaseKeys([transaction({ installmentNumber: 2, installmentTotal: 3 })], november);
        const key = items[0].purchaseKey;
        const rows = [
            existing({ purchaseKey: key, month: october }),
            existing({ purchaseKey: key, month: november, sourceMonth: october, nickname: 'Geladeira', personId: 'p1' }),
            existing({ purchaseKey: key, month: december, sourceMonth: october })
        ];
        const result = plan('2026-11', items, rows);

        expect(result.creates).toHaveLength(0);
        expect(result.updates.map(update => update.id)).toEqual([rows[1].id, rows[2].id]);
        expect(result.updates[0].data.sourceMonth).toEqual(november);
        expect(result.summary).toEqual({ created: 0, updated: 1, removed: 0, projected: 1 });
    });

    it('não deixa um upload antigo sobrescrever o que um mês posterior confirmou', () => {
        const items = assignPurchaseKeys([transaction({ installmentNumber: 1, installmentTotal: 3 })], october);
        const key = items[0].purchaseKey;
        const rows = [
            existing({ purchaseKey: key, month: october }),
            existing({ purchaseKey: key, month: november, sourceMonth: november }),
            existing({ purchaseKey: key, month: december, sourceMonth: november })
        ];
        const result = plan('2026-10', items, rows);

        expect(result.updates.map(update => update.id)).toEqual([rows[0].id]);
        expect(result.creates).toHaveLength(0);
    });

    it('não projeta em meses que já têm upload próprio, nem depois deles', () => {
        // Novembro já foi enviado e não trouxe esta compra (foi cancelada). Reenviar outubro não pode trazê-la de volta.
        const items = assignPurchaseKeys([transaction({ installmentNumber: 1, installmentTotal: 4 })], october);
        const result = plan('2026-10', items, [], '2026-11');

        expect(result.creates.map(row => row.month.toISOString().slice(0, 7))).toEqual(['2026-10']);
        expect(result.summary.projected).toBe(0);
    });

    it('remove compras que sumiram do mês e as parcelas futuras projetadas por elas', () => {
        const key = 'P|2026-10|3|SUMIU';
        const rows = [
            existing({ purchaseKey: key, month: october }),
            existing({ purchaseKey: key, month: november, sourceMonth: october }),
            existing({ purchaseKey: key, month: december, sourceMonth: december })
        ];
        const result = plan('2026-10', [], rows);

        expect(result.deleteIds).toEqual([rows[0].id, rows[1].id]);
        expect(result.summary.removed).toBe(2);
    });

    it('faz novas linhas herdarem apelido, categoria e pessoa de outra parcela da compra', () => {
        const items = assignPurchaseKeys([transaction({ installmentNumber: 3, installmentTotal: 4 })], december);
        const key = items[0].purchaseKey;
        const rows = [existing({ purchaseKey: key, month: november, nickname: 'Sofá', categoryId: 'cat-casa', personId: 'p2' })];
        const result = plan('2026-12', items, rows);

        expect(result.creates).toHaveLength(2);
        expect(result.creates.every(row => row.nickname === 'Sofá' && row.categoryId === 'cat-casa' && row.personId === 'p2')).toBe(true);
    });
});
