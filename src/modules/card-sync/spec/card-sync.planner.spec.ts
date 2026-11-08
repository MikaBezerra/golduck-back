import type { CardExpense } from '../../../generated/prisma/client.js';
import type { PurchaseAnchor } from '../../card-expenses/service/purchase-schedule.js';
import type { SyncedTransaction } from '../service/pluggy-transaction.normalizer.js';

import { BillingCalendar } from '../../credit-cards/service/billing-calendar.js';
import { assignSyncKeys, CardSyncPlanInput, planCardSync } from '../service/card-sync.planner.js';

const CARD_ID = 'cartao-c6';
const OUTROS = 'categoria-outros';
const MERCADO = 'categoria-mercado';
const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const month = (value: string): Date => day(`${value}-01`);
const ym = (date: Date): string => date.toISOString().slice(0, 7);
/** C6: melhor dia 25, vence dia 1. */
const c6 = new BillingCalendar({ dueDay: 1, bestPurchaseDay: 25 });

let sequence = 0;

const synced = (data: Partial<SyncedTransaction> & Pick<SyncedTransaction, 'description' | 'postedDate'>): SyncedTransaction => {
    sequence++;

    return {
        externalId: `tx-${sequence}`,
        bankBillMonth: null,
        purchaseDate: data.postedDate,
        amountCents: 1000n,
        installmentNumber: null,
        installmentTotal: null,
        cardLastDigits: '1234',
        billId: null,
        order: `${data.postedDate.toISOString()}|${String(sequence).padStart(4, '0')}`,
        ...data
    };
};

const existingRow = (data: Partial<CardExpense> & Pick<CardExpense, 'purchaseKey' | 'month'>): CardExpense => ({
    id: `linha-${++sequence}`,
    cardId: CARD_ID,
    importId: null,
    origin: 'SYNC',
    externalId: null,
    sourceMonth: data.month,
    transactionDate: day('2026-11-01'),
    originalDescription: 'COMPRA',
    holderName: null,
    cardLastDigits: '1234',
    amountCents: 1000n,
    installmentNumber: null,
    installmentTotal: null,
    nickname: null,
    categoryId: OUTROS,
    personId: null,
    split: data.personId ? 'PERSONAL' : 'SHARED',
    excludedAt: null,
    exclusionRemembered: false,
    createdAt: day('2026-11-01'),
    updatedAt: day('2026-11-01'),
    ...data
});

const plan = (input: Partial<CardSyncPlanInput> & Pick<CardSyncPlanInput, 'transactions'>) => planCardSync({
    cardId: CARD_ID,
    syncFromMonth: month('2026-11'),
    billMonthOf: date => c6.billMonthOf(date),
    billMonthById: new Map(),
    corrections: new Map(),
    existing: [],
    defaultCategoryId: OUTROS,
    ...input
});

/** Plano da sincronização: chaves, fatura de cada lançamento, parcelas lançadas e a comparação com o que existe. */
describe('planCardSync', () => {
    describe('chaves das compras', () => {
        it('à vista: data + valor + descrição; parcelada: data da compra + total + descrição; repetidas ganham #2', () => {
            const keyed = assignSyncKeys([
                synced({ description: 'Padaria', postedDate: day('2026-11-02'), amountCents: 750n }),
                synced({ description: 'padaria ', postedDate: day('2026-11-02'), amountCents: 750n }),
                synced({ description: 'Loja', postedDate: day('2026-11-03'), purchaseDate: day('2026-08-07'), installmentNumber: 4, installmentTotal: 5 }),
                synced({ description: 'Loja', postedDate: day('2026-12-03'), purchaseDate: day('2026-08-07'), installmentNumber: 5, installmentTotal: 5 }),
                synced({ description: 'Loja', postedDate: day('2026-11-03'), purchaseDate: day('2026-08-07'), installmentNumber: 4, installmentTotal: 5 })
            ]);

            expect(keyed.map(transaction => transaction.purchaseKey)).toEqual([
                'S|2026-11-02|750|PADARIA',
                'S|2026-11-02|750|PADARIA#2',
                'P|2026-08-07|5|LOJA',
                'P|2026-08-07|5|LOJA#2',
                'P|2026-08-07|5|LOJA'
            ]);
        });
    });

    describe('fatura de cada lançamento', () => {
        it('pelo calendário do cartão, a partir da primeira fatura sincronizada', () => {
            const result = plan({
                transactions: [
                    synced({ description: 'Antes', postedDate: day('2026-09-20') }),
                    synced({ description: 'Novembro', postedDate: day('2026-10-24') }),
                    synced({ description: 'Dezembro', postedDate: day('2026-11-06') })
                ]
            });

            expect(result.creates.map(row => [row.originalDescription, ym(row.month)])).toEqual([['Novembro', '2026-11'], ['Dezembro', '2026-12']]);
            expect(result.creates[0]).toMatchObject({
                origin: 'SYNC', importId: null, categoryId: OUTROS, nickname: null, personId: null, excludedAt: null, holderName: null, cardId: CARD_ID,
                // Compra que ninguém viu ainda: pendente até alguém escolher a pessoa.
                split: 'PENDING'
            });
        });

        it('a fatura informada pelo banco (billId) vale sobre o calendário', () => {
            const result = plan({
                transactions: [synced({ description: 'Posto', postedDate: day('2026-11-24'), billId: 'fatura-jan' })],
                billMonthById: new Map([['fatura-jan', month('2027-01')]])
            });

            expect(result.creates.map(row => ym(row.month))).toEqual(['2027-01']);
        });

        it('Nubank: a fatura prevista pelo banco vale sobre o calendário; o billId vale sobre ela', () => {
            const result = plan({
                transactions: [
                    synced({ description: 'Mercado', postedDate: day('2026-10-25'), bankBillMonth: month('2026-11') }),
                    synced({ description: 'Farmacia', postedDate: day('2026-10-25'), bankBillMonth: month('2026-11'), billId: 'dez' })
                ],
                billMonthById: new Map([['dez', month('2026-12')]])
            });

            expect(result.creates.map(row => [row.originalDescription, ym(row.month)])).toEqual([['Mercado', '2026-11'], ['Farmacia', '2026-12']]);
        });

        it('a correção do usuário vale sobre tudo, inclusive renumerando as parcelas', () => {
            const correction: PurchaseAnchor = { installmentNumber: 1, installmentTotal: 5, month: month('2026-12') };
            const transaction = synced({
                description: 'Loja', postedDate: day('2026-11-03'), purchaseDate: day('2026-09-10'), installmentNumber: 3, installmentTotal: 5, billId: 'x'
            });

            const result = plan({
                transactions: [transaction],
                billMonthById: new Map([['x', month('2026-11')]]),
                corrections: new Map([['P|2026-09-10|5|LOJA', correction]])
            });

            expect(result.creates.map(row => [ym(row.month), row.installmentNumber, row.externalId])).toEqual([
                ['2026-12', 1, null],
                ['2027-01', 2, null],
                ['2027-02', 3, transaction.externalId],
                ['2027-03', 4, null],
                ['2027-04', 5, null]
            ]);
        });

        it('correção de compra à vista: muda só o mês', () => {
            const result = plan({
                transactions: [synced({ description: 'Posto', postedDate: day('2026-10-23'), amountCents: 1099n })],
                corrections: new Map([['S|2026-10-23|1099|POSTO', { installmentNumber: 1, installmentTotal: null, month: month('2026-11') }]])
            });

            expect(result.creates.map(row => [ym(row.month), row.installmentNumber])).toEqual([['2026-11', null]]);
        });
    });

    describe('parcelas', () => {
        it('Neon: só a 1ª parcela veio; as outras são lançadas mês a mês com o mesmo valor', () => {
            const result = plan({
                transactions: [synced({ description: 'Tenis', postedDate: day('2026-09-15'), installmentNumber: 1, installmentTotal: 5, amountCents: 13160n })],
                billMonthOf: date => new BillingCalendar({ dueDay: 1, bestPurchaseDay: 27 }).billMonthOf(date)
            });

            // 1/5 em outubro fica de fora (antes de novembro); 2/5 a 5/5 de novembro a fevereiro.
            expect(result.creates.map(row => [ym(row.month), row.installmentNumber, row.amountCents, ym(row.sourceMonth)])).toEqual([
                ['2026-11', 2, 13160n, '2026-10'],
                ['2026-12', 3, 13160n, '2026-10'],
                ['2027-01', 4, 13160n, '2026-10'],
                ['2027-02', 5, 13160n, '2026-10']
            ]);
        });

        it('Nubank: as parcelas futuras já vêm; nada é lançado depois da última', () => {
            const result = plan({
                transactions: [4, 5].map(number => synced({
                    description: 'Loja',
                    postedDate: number === 4 ? day('2026-10-26') : day('2026-11-26'),
                    purchaseDate: day('2026-08-07'),
                    installmentNumber: number,
                    installmentTotal: 5
                })),
                billMonthOf: date => new BillingCalendar({ dueDay: 2, bestPurchaseDay: 25 }).billMonthOf(date)
            });

            expect(result.creates.map(row => [ym(row.month), row.installmentNumber])).toEqual([['2026-12', 4], ['2027-01', 5]]);
        });

        it('duas parcelas da mesma compra na mesma fatura: fica a primeira', () => {
            const result = plan({
                transactions: [1, 2].map(number => synced({
                    description: 'Loja', postedDate: day(`2026-11-0${number}`), purchaseDate: day('2026-11-01'), installmentNumber: number, installmentTotal: 2
                }))
            });

            expect(result.creates.map(row => [ym(row.month), row.installmentNumber])).toEqual([['2026-12', 1], ['2027-01', 2]]);
        });
    });

    describe('comparação com o que está gravado', () => {
        it('linha igual não muda; linha diferente é atualizada sem mexer na personalização', () => {
            const same = synced({ description: 'Mercado', postedDate: day('2026-11-02'), amountCents: 500n });
            const changed = synced({ description: 'Posto', postedDate: day('2026-11-03'), amountCents: 900n });
            const sameRow = existingRow({
                purchaseKey: 'S|2026-11-02|500|MERCADO', month: month('2026-12'), originalDescription: 'Mercado', transactionDate: day('2026-11-02'),
                amountCents: 500n, externalId: same.externalId
            });
            const changedRow = existingRow({ purchaseKey: 'S|2026-11-03|900|POSTO', month: month('2026-12'), nickname: 'Gasolina', categoryId: MERCADO });

            const result = plan({ transactions: [same, changed], existing: [sameRow, changedRow] });

            expect(result.summary).toEqual({ created: 0, updated: 1, unchanged: 1, removed: 0, replacedManual: 0 });
            expect(result.updates).toHaveLength(1);
            expect(result.updates[0]).toMatchObject({ id: changedRow.id, data: { originalDescription: 'Posto', externalId: changed.externalId } });
            expect(result.updates[0].data).not.toHaveProperty('nickname');
        });

        it('compra que mudou de fatura sai da antiga e entra na nova com apelido, categoria, pessoa e exclusão', () => {
            const moved = existingRow({
                purchaseKey: 'S|2026-11-24|1000|POSTO', month: month('2026-12'), nickname: 'Gasolina', categoryId: MERCADO, personId: 'ana',
                excludedAt: day('2026-11-25'), exclusionRemembered: true
            });

            const result = plan({
                transactions: [synced({ description: 'Posto', postedDate: day('2026-11-24'), billId: 'jan' })],
                billMonthById: new Map([['jan', month('2027-01')]]),
                existing: [moved]
            });

            expect(result.deleteIds).toEqual([moved.id]);
            expect(result.creates).toEqual([expect.objectContaining({
                month: month('2027-01'), nickname: 'Gasolina', categoryId: MERCADO, split: 'PERSONAL', personId: 'ana', excludedAt: day('2026-11-25'), exclusionRemembered: true
            })]);
        });

        it('linhas sincronizadas ou de upload que não vieram saem; as de meses anteriores ficam', () => {
            const gone = existingRow({ purchaseKey: 'S|2026-11-01|100|SUMIU', month: month('2026-12') });
            const upload = existingRow({ purchaseKey: 'P|2026-10|4|LOJA', month: month('2026-11'), origin: 'UPLOAD', importId: 'upload-1' });
            const older = existingRow({ purchaseKey: 'S|2026-09-01|100|ANTIGA', month: month('2026-10') });

            const result = plan({ transactions: [], existing: [gone, upload, older] });

            expect(result.deleteIds).toEqual([gone.id, upload.id]);
            expect(result.summary.removed).toBe(2);
        });

        it('compra de "Adicionar compra" igual à do banco (valor, parcelas e até 3 dias) é substituída e passa a personalização', () => {
            const manual = existingRow({
                purchaseKey: 'M|1', month: month('2026-12'), origin: 'MANUAL', transactionDate: day('2026-11-04'), amountCents: 1290n, nickname: 'Pão', categoryId: MERCADO
            });
            const farAway = existingRow({ purchaseKey: 'M|2', month: month('2026-12'), origin: 'MANUAL', transactionDate: day('2026-11-20'), amountCents: 1290n });

            const result = plan({
                transactions: [synced({ description: 'Padaria', postedDate: day('2026-11-06'), amountCents: 1290n })],
                existing: [manual, farAway]
            });

            expect(result.deleteIds).toEqual([manual.id]);
            expect(result.summary).toMatchObject({ created: 1, removed: 0, replacedManual: 1 });
            expect(result.creates).toEqual([expect.objectContaining({
                originalDescription: 'Padaria', nickname: 'Pão', categoryId: MERCADO, origin: 'SYNC', split: 'SHARED', personId: null
            })]);
        });

        it('compra nova sem histórico herda de outra parcela da mesma compra, gravada em mês anterior', () => {
            const earlier = existingRow({
                purchaseKey: 'P|2026-08-07|5|LOJA', month: month('2026-10'), installmentNumber: 3, installmentTotal: 5, nickname: 'Sofá', categoryId: MERCADO,
                personId: 'ana'
            });

            const result = plan({
                transactions: [synced({ description: 'Loja', postedDate: day('2026-10-01'), purchaseDate: day('2026-08-07'), installmentNumber: 4, installmentTotal: 5 })],
                existing: [earlier]
            });

            // A pessoa também vem junto: parcela nova de compra já classificada não volta a ficar pendente.
            expect(result.creates.map(row => [ym(row.month), row.installmentNumber, row.nickname, row.split, row.personId])).toEqual([
                ['2026-11', 4, 'Sofá', 'PERSONAL', 'ana'],
                ['2026-12', 5, 'Sofá', 'PERSONAL', 'ana']
            ]);
            expect(result.deleteIds).toEqual([]);
        });
    });
});
