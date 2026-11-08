import type { PrismaService } from '../../common/index.js';
import { jest } from '@jest/globals';

import { SummaryDispatchRepository } from '../repository/summary-dispatch.repository.js';

const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const WITH_ITEMS = { items: { orderBy: [{ name: 'asc' }, { createdAt: 'asc' }] } };

/*
 * O repositório só monta as consultas do Prisma: confere os filtros, o include dos itens em ordem
 * alfabética e que o runningMonth é preenchido ao começar e limpo ao terminar.
 */
describe('SummaryDispatchRepository', () => {
    const dispatch = { id: 'd1', items: [] };
    const prisma = {
        summaryDispatch: {
            findUnique: jest.fn(async () => Promise.resolve(dispatch)),
            findMany: jest.fn(async () => Promise.resolve([dispatch])),
            updateMany: jest.fn(async () => Promise.resolve({ count: 2 })),
            create: jest.fn(async () => Promise.resolve(dispatch)),
            update: jest.fn(async () => Promise.resolve(dispatch))
        },
        summaryDispatchItem: { create: jest.fn(async () => Promise.resolve({})) },
        person: { findMany: jest.fn(async () => Promise.resolve([])) }
    };
    const repository = new SummaryDispatchRepository(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('findByKey busca pela Idempotency-Key com os itens', async () => {
        await expect(repository.findByKey('k')).resolves.toBe(dispatch);
        expect(prisma.summaryDispatch.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'k' }, include: WITH_ITEMS });
    });

    it('findByMonth lista os envios do mês, do mais recente para o mais antigo', async () => {
        await repository.findByMonth(NOVEMBER, 20);

        expect(prisma.summaryDispatch.findMany).toHaveBeenCalledWith({
            where: { month: NOVEMBER }, orderBy: { startedAt: 'desc' }, take: 20, include: WITH_ITEMS
        });
    });

    it('findContacts lê nome e e-mail das pessoas; sem ids, nem vai ao banco', async () => {
        await repository.findContacts(['ana']);
        await expect(repository.findContacts([])).resolves.toEqual([]);

        expect(prisma.person.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.person.findMany).toHaveBeenCalledWith({ where: { id: { in: ['ana'] } }, select: { id: true, name: true, email: true } });
    });

    it('releaseStale solta o runningMonth dos envios presos e marca como INTERRUPTED', async () => {
        const before = new Date('2026-11-08T12:00:00.000Z');

        await expect(repository.releaseStale(NOVEMBER, before)).resolves.toBe(2);
        expect(prisma.summaryDispatch.updateMany).toHaveBeenCalledWith({
            where: { runningMonth: NOVEMBER, startedAt: { lt: before } },
            data: { runningMonth: null, status: 'INTERRUPTED', finishedAt: expect.any(Date) as Date }
        });
    });

    it('start grava o envio com runningMonth = mês (o índice único barra o segundo)', async () => {
        await repository.start(NOVEMBER, 'k');

        expect(prisma.summaryDispatch.create).toHaveBeenCalledWith({
            data: { month: NOVEMBER, runningMonth: NOVEMBER, idempotencyKey: 'k' }, include: WITH_ITEMS
        });
    });

    it('addItem grava o resultado de uma pessoa', async () => {
        const item = { personId: 'ana', name: 'Ana', recipient: null, status: 'SKIPPED_NO_EMAIL' as const, errorCode: null, message: 'x' };

        await repository.addItem('d1', item);

        expect(prisma.summaryDispatchItem.create).toHaveBeenCalledWith({ data: { dispatchId: 'd1', ...item } });
    });

    it('finish fecha o envio e limpa o runningMonth', async () => {
        await repository.finish('d1', 'DONE');

        expect(prisma.summaryDispatch.update).toHaveBeenCalledWith({
            where: { id: 'd1' },
            data: { status: 'DONE', runningMonth: null, finishedAt: expect.any(Date) as Date },
            include: WITH_ITEMS
        });
    });
});
