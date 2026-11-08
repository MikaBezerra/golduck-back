import type { PrismaService } from '../../common/index.js';
import type { CardImportPlan } from '../service/card-import.planner.js';
import { jest } from '@jest/globals';

import { CardImportRepository, NewCardImport, PlanningContext } from '../repository/card-import.repository.js';

/*
 * O repositório monta as consultas do Prisma e a transação do upload. O teste usa um Prisma falso
 * e confere os argumentos exatos: filtros, ordenação, contagem de despesas e a ordem das
 * gravações dentro da transação (tudo pelo cliente da transação, nunca pelo Prisma de fora).
 */

const MONTH = new Date('2026-11-01T00:00:00.000Z');
const NOW = new Date('2026-11-20T12:00:00.000Z');

function fakeClient() {
    return {
        cardImport: {
            create: jest.fn(async (args: { data: NewCardImport }) => Promise.resolve({ id: 'import-novo', ...args.data, createdAt: NOW })),
            findFirst: jest.fn(async (): Promise<{ month: Date } | null> => Promise.resolve(null)),
            findMany: jest.fn(async (): Promise<unknown[]> => Promise.resolve([])),
            findUnique: jest.fn(async (): Promise<unknown> => Promise.resolve(null)),
            delete: jest.fn(async () => Promise.resolve({}))
        },
        cardExpense: {
            findMany: jest.fn(async (): Promise<unknown[]> => Promise.resolve([])),
            deleteMany: jest.fn(async () => Promise.resolve({ count: 0 })),
            update: jest.fn(async () => Promise.resolve({})),
            createMany: jest.fn(async () => Promise.resolve({ count: 0 })),
            updateMany: jest.fn(async () => Promise.resolve({ count: 0 }))
        }
    };
}

type FakeClient = ReturnType<typeof fakeClient>;

/** O Prisma de fora: as mesmas consultas e a transação, que roda o callback com o cliente `tx`. */
function fakePrisma(tx: FakeClient) {
    return {
        ...fakeClient(),
        $transaction: jest.fn<(callback: (client: FakeClient) => Promise<unknown>, options: { timeout: number }) => Promise<unknown>>(
            async callback => callback(tx)
        )
    };
}

function emptyPlan(overrides: Partial<CardImportPlan> = {}): CardImportPlan {
    return {
        deleteIds: [],
        updates: [],
        creates: [],
        transactions: [],
        summary: { created: 0, updated: 0, removed: 0, projected: 0 },
        ...overrides
    };
}

const NEW_IMPORT: NewCardImport = {
    cardId: 'card-1',
    month: MONTH,
    fileName: 'fatura.csv',
    fileHash: 'f'.repeat(64),
    parserVersion: 'nubank-csv@1',
    rowCount: 3,
    ignoredCount: 1
};

describe('CardImportRepository', () => {
    let prisma: ReturnType<typeof fakePrisma>;
    let tx: FakeClient;
    let repository: CardImportRepository;

    beforeEach(() => {
        tx = fakeClient();
        prisma = fakePrisma(tx);
        repository = new CardImportRepository(prisma as unknown as PrismaService);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('loadPlanningContext', () => {
        it('junta as chaves do arquivo e as do mês (sem repetir) e busca o próximo mês com upload', async () => {
            prisma.cardExpense.findMany
                .mockResolvedValueOnce([{ purchaseKey: 'B' }, { purchaseKey: 'C' }, { purchaseKey: 'C' }])
                .mockResolvedValueOnce([{ id: 'linha-1' }]);
            prisma.cardImport.findFirst.mockResolvedValueOnce({ month: new Date('2027-01-01T00:00:00.000Z') });

            const context = await repository.loadPlanningContext('card-1', MONTH, ['A', 'B']);

            expect(prisma.cardExpense.findMany).toHaveBeenNthCalledWith(1, {
                where: { cardId: 'card-1', month: MONTH, origin: { not: 'MANUAL' } },
                select: { purchaseKey: true }
            });
            expect(prisma.cardExpense.findMany).toHaveBeenNthCalledWith(2, {
                where: { cardId: 'card-1', purchaseKey: { in: ['A', 'B', 'C'] } }
            });
            expect(prisma.cardImport.findFirst).toHaveBeenCalledWith({
                where: { cardId: 'card-1', month: { gt: MONTH } },
                orderBy: { month: 'asc' },
                select: { month: true }
            });
            expect(context).toEqual({ existing: [{ id: 'linha-1' }], nextImportedMonth: new Date('2027-01-01T00:00:00.000Z') });
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('sem chaves no arquivo nem no mês, não busca linhas; sem upload posterior, nextImportedMonth é null', async () => {
            const context = await repository.loadPlanningContext('card-1', MONTH, []);

            expect(prisma.cardExpense.findMany).toHaveBeenCalledTimes(1);
            expect(context).toEqual({ existing: [], nextImportedMonth: null });
        });
    });

    describe('apply', () => {
        it('grava o upload, lê o contexto e aplica o plano dentro de uma transação de até 30 s', async () => {
            const existingRow = { id: 'antiga', purchaseKey: 'A' };
            tx.cardExpense.findMany
                .mockResolvedValueOnce([{ purchaseKey: 'A' }])
                .mockResolvedValueOnce([existingRow]);
            tx.cardImport.findFirst.mockResolvedValueOnce({ month: new Date('2026-12-01T00:00:00.000Z') });
            const creates = [{ purchaseKey: 'N', month: MONTH }, { purchaseKey: 'N', month: new Date('2026-12-01T00:00:00.000Z') }];
            const planned = emptyPlan({
                deleteIds: ['velha-1', 'velha-2'],
                updates: [
                    { id: 'u1', data: { amountCents: 100n } as CardImportPlan['updates'][number]['data'] },
                    { id: 'u2', data: { amountCents: 200n, nickname: 'Apelido' } as CardImportPlan['updates'][number]['data'] }
                ],
                creates: creates as unknown as CardImportPlan['creates']
            });
            const plan = jest.fn((context: PlanningContext): CardImportPlan => {
                expect(context).toEqual({ existing: [existingRow], nextImportedMonth: new Date('2026-12-01T00:00:00.000Z') });
                return planned;
            });

            const result = await repository.apply({ data: NEW_IMPORT, purchaseKeys: ['N'], plan });

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(prisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 30_000 });
            expect(tx.cardImport.create).toHaveBeenCalledWith({ data: NEW_IMPORT });
            expect(tx.cardExpense.findMany).toHaveBeenNthCalledWith(2, { where: { cardId: 'card-1', purchaseKey: { in: ['N', 'A'] } } });
            expect(tx.cardImport.findFirst).toHaveBeenCalledWith({
                where: { cardId: 'card-1', month: { gt: MONTH } },
                orderBy: { month: 'asc' },
                select: { month: true }
            });
            expect(plan).toHaveBeenCalledTimes(1);
            expect(tx.cardExpense.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['velha-1', 'velha-2'] } } });
            expect(tx.cardExpense.update).toHaveBeenNthCalledWith(1, { where: { id: 'u1' }, data: { amountCents: 100n, importId: 'import-novo', origin: 'UPLOAD' } });
            expect(tx.cardExpense.update).toHaveBeenNthCalledWith(2, {
                where: { id: 'u2' },
                data: { amountCents: 200n, nickname: 'Apelido', importId: 'import-novo', origin: 'UPLOAD' }
            });
            expect(tx.cardExpense.createMany).toHaveBeenCalledWith({
                data: [
                    { purchaseKey: 'N', month: MONTH, importId: 'import-novo' },
                    { purchaseKey: 'N', month: new Date('2026-12-01T00:00:00.000Z'), importId: 'import-novo' }
                ]
            });
            expect(tx.cardExpense.updateMany).not.toHaveBeenCalled();
            expect(result).toEqual({ cardImport: { id: 'import-novo', ...NEW_IMPORT, createdAt: NOW }, plan: planned });

            // Nada passa pelo Prisma de fora da transação.
            for (const method of [...Object.values(prisma.cardImport), ...Object.values(prisma.cardExpense)]) {
                expect(method).not.toHaveBeenCalled();
            }
        });

        it('plano vazio: não apaga nem cria nada (sem chamadas com listas vazias)', async () => {
            const result = await repository.apply({ data: NEW_IMPORT, purchaseKeys: [], plan: () => emptyPlan() });

            expect(tx.cardExpense.deleteMany).not.toHaveBeenCalled();
            expect(tx.cardExpense.update).not.toHaveBeenCalled();
            expect(tx.cardExpense.createMany).not.toHaveBeenCalled();
            expect(result.plan).toEqual(emptyPlan());
        });

        it('aplica as decisões de exclusão depois do plano, no escopo pedido', async () => {
            jest.useFakeTimers({ now: NOW });
            const order: string[] = [];
            tx.cardExpense.createMany.mockImplementation(async () => {
                order.push('createMany');
                return Promise.resolve({ count: 1 });
            });
            tx.cardExpense.updateMany.mockImplementation(async () => {
                order.push('updateMany');
                return Promise.resolve({ count: 1 });
            });

            await repository.apply({
                data: NEW_IMPORT,
                purchaseKeys: ['A', 'B', 'C'],
                plan: () => emptyPlan({ creates: [{ purchaseKey: 'A' }] as unknown as CardImportPlan['creates'] }),
                exclusions: [
                    { purchaseKey: 'A', action: 'exclude', scope: 'forward', remember: true },
                    { purchaseKey: 'B', action: 'restore', scope: 'all', remember: false },
                    { purchaseKey: 'C', action: 'exclude', scope: 'month', remember: false }
                ]
            });

            expect(order).toEqual(['createMany', 'updateMany', 'updateMany', 'updateMany', 'updateMany', 'updateMany']);
            expect(tx.cardExpense.updateMany.mock.calls).toEqual([
                // Excluir: marca a data só nas que ainda não estavam excluídas (mantém a data original)...
                [{ where: { cardId: 'card-1', purchaseKey: 'A', month: { gte: MONTH }, excludedAt: null }, data: { excludedAt: NOW } }],
                // ...e grava o "não perguntar de novo" em todas as do escopo.
                [{ where: { cardId: 'card-1', purchaseKey: 'A', month: { gte: MONTH } }, data: { exclusionRemembered: true } }],
                // Restaurar: tira a exclusão e o "não perguntar de novo".
                [{ where: { cardId: 'card-1', purchaseKey: 'B', month: undefined }, data: { excludedAt: null, exclusionRemembered: false } }],
                [{ where: { cardId: 'card-1', purchaseKey: 'C', month: { equals: MONTH }, excludedAt: null }, data: { excludedAt: NOW } }],
                [{ where: { cardId: 'card-1', purchaseKey: 'C', month: { equals: MONTH } }, data: { exclusionRemembered: false } }]
            ]);
        });

        it('se uma gravação falha, o erro sai da transação como veio (o banco desfaz tudo)', async () => {
            const failure = new Error('falha ao gravar');
            tx.cardExpense.update.mockRejectedValueOnce(failure);

            const applying = repository.apply({
                data: NEW_IMPORT,
                purchaseKeys: ['A'],
                plan: () => emptyPlan({
                    updates: [{ id: 'u1', data: {} as CardImportPlan['updates'][number]['data'] }],
                    creates: [{ purchaseKey: 'A' }] as unknown as CardImportPlan['creates']
                })
            });

            await expect(applying).rejects.toBe(failure);
            expect(tx.cardExpense.createMany).not.toHaveBeenCalled();
        });
    });

    describe('consultas', () => {
        const stored = {
            id: 'import-1',
            cardId: 'card-1',
            month: MONTH,
            fileName: 'fatura.csv',
            fileHash: 'f'.repeat(64),
            parserVersion: 'nubank-csv@1',
            rowCount: 3,
            ignoredCount: 1,
            createdAt: NOW
        };

        it('findAll filtra pelo que veio, conta as despesas e ordena do mais recente (desempate pelo id)', async () => {
            prisma.cardImport.findMany.mockResolvedValueOnce([{ ...stored, _count: { expenses: 7 } }]);

            const imports = await repository.findAll({ cardId: 'card-1', month: MONTH });

            expect(prisma.cardImport.findMany).toHaveBeenCalledWith({
                where: { cardId: 'card-1', month: MONTH },
                include: { _count: { select: { expenses: true } } },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
            });
            expect(imports).toEqual([{ ...stored, expenseCount: 7 }]);
        });

        it('findById devolve o upload com a contagem, ou null', async () => {
            prisma.cardImport.findUnique.mockResolvedValueOnce({ ...stored, _count: { expenses: 2 } });

            await expect(repository.findById('import-1')).resolves.toEqual({ ...stored, expenseCount: 2 });
            await expect(repository.findById('outro')).resolves.toBeNull();
            expect(prisma.cardImport.findUnique).toHaveBeenNthCalledWith(1, {
                where: { id: 'import-1' },
                include: { _count: { select: { expenses: true } } }
            });
            expect(prisma.cardImport.findUnique).toHaveBeenNthCalledWith(2, {
                where: { id: 'outro' },
                include: { _count: { select: { expenses: true } } }
            });
        });

        it('delete apaga o upload pelo id (as despesas saem em cascata no banco)', async () => {
            await repository.delete('import-1');

            expect(prisma.cardImport.delete).toHaveBeenCalledWith({ where: { id: 'import-1' } });
            expect(prisma.cardExpense.deleteMany).not.toHaveBeenCalled();
        });
    });
});
