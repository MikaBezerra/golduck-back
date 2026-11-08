import { CARD_EXPENSE_SCOPES, purchaseScopeWhere } from '../service/card-expense-scope.js';

const PURCHASE = { cardId: 'cartao-1', purchaseKey: 'P|2026-09|4|TV' };
const OCTOBER = new Date('2026-10-01T00:00:00.000Z');

/** Filtro das parcelas de uma compra afetadas por excluir/restaurar (também usado nos uploads de fatura). */
describe('purchaseScopeWhere', () => {
    it('os escopos aceitos são month, forward, backward e all', () => {
        expect(CARD_EXPENSE_SCOPES).toEqual(['month', 'forward', 'backward', 'all']);
    });

    it('month: só a parcela do mês', () => {
        expect(purchaseScopeWhere(PURCHASE, OCTOBER, 'month')).toStrictEqual({ ...PURCHASE, month: { equals: OCTOBER } });
    });

    it('forward: o mês e os seguintes', () => {
        expect(purchaseScopeWhere(PURCHASE, OCTOBER, 'forward')).toStrictEqual({ ...PURCHASE, month: { gte: OCTOBER } });
    });

    it('backward: o mês e os anteriores', () => {
        expect(purchaseScopeWhere(PURCHASE, OCTOBER, 'backward')).toStrictEqual({ ...PURCHASE, month: { lte: OCTOBER } });
    });

    it('all: todas as parcelas da compra (sem filtro de mês), sempre do mesmo cartão e purchaseKey', () => {
        expect(purchaseScopeWhere(PURCHASE, OCTOBER, 'all')).toStrictEqual({ ...PURCHASE, month: undefined });
    });

    it('usa só o cartão e a purchaseKey da compra (ignora outros campos da linha)', () => {
        const expense = { ...PURCHASE, id: 'linha-1', categoryId: 'categoria' };

        expect(purchaseScopeWhere(expense, OCTOBER, 'month')).toStrictEqual({ ...PURCHASE, month: { equals: OCTOBER } });
    });
});
