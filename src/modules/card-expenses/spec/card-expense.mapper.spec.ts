import type { CardExpense } from '../../../generated/prisma/client.js';

import { toCardExpenseResponse } from '../service/card-expense.mapper.js';

const CREATED_AT = new Date('2026-10-02T13:45:00.000Z');
const UPDATED_AT = new Date('2026-10-03T08:00:00.000Z');

/** Linha do banco de uma compra parcelada, com apelido e excluída. */
const row = (changes: Partial<CardExpense> = {}): CardExpense => ({
    id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
    cardId: '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    importId: '8e9f0a1b-2c3d-4e5f-9a6b-7c8d9e0f1a2b',
    month: new Date('2026-10-01T00:00:00.000Z'),
    sourceMonth: new Date('2026-09-01T00:00:00.000Z'),
    purchaseKey: 'P|2026-09|10|LOJA',
    transactionDate: new Date('2026-08-26T00:00:00.000Z'),
    originalDescription: 'LOJA*CENTRO',
    holderName: 'ANA SILVA',
    cardLastDigits: '1951',
    amountCents: 12345n,
    installmentNumber: 3,
    installmentTotal: 10,
    nickname: 'Sofá',
    categoryId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    personId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    excludedAt: new Date('2026-10-04T10:00:00.000Z'),
    exclusionRemembered: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...changes
});

/** Conversão da linha do banco para o formato da API (também usada na pré-visualização de faturas). */
describe('toCardExpenseResponse', () => {
    it('converte todos os campos: mês AAAA-MM, data AAAA-MM-DD, valor em reais, parcela e excluída', () => {
        expect(toCardExpenseResponse(row())).toEqual({
            id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
            cardId: '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
            importId: '8e9f0a1b-2c3d-4e5f-9a6b-7c8d9e0f1a2b',
            month: '2026-10',
            transactionDate: '2026-08-26',
            description: 'Sofá',
            originalDescription: 'LOJA*CENTRO',
            nickname: 'Sofá',
            holderName: 'ANA SILVA',
            cardLastDigits: '1951',
            amount: '123.45',
            installment: { number: 3, total: 10 },
            categoryId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
            personId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
            excluded: true,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT
        });
    });

    it('sem apelido, a descrição é a original do banco', () => {
        expect(toCardExpenseResponse(row({ nickname: null }))).toMatchObject({ description: 'LOJA*CENTRO', nickname: null });
    });

    it('compra à vista ou parcela incompleta: installment null', () => {
        expect(toCardExpenseResponse(row({ installmentNumber: null, installmentTotal: null })).installment).toBeNull();
        expect(toCardExpenseResponse(row({ installmentNumber: 3, installmentTotal: null })).installment).toBeNull();
        expect(toCardExpenseResponse(row({ installmentNumber: null, installmentTotal: 10 })).installment).toBeNull();
    });

    it('não excluída, sem titular e sem final do cartão', () => {
        expect(toCardExpenseResponse(row({ excludedAt: null, holderName: null, cardLastDigits: null, personId: null }))).toMatchObject({
            excluded: false, holderName: null, cardLastDigits: null, personId: null
        });
    });

    it('estorno (valor negativo) mantém o sinal', () => {
        expect(toCardExpenseResponse(row({ amountCents: -1550n })).amount).toBe('-15.50');
    });
});
