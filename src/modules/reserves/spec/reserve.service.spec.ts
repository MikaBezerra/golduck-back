import type { AppError } from '../../common/errors/app-error.js';
import { jest } from '@jest/globals';

import { Prisma } from '../../../generated/prisma/client.js';
import { ReserveRepository } from '../repository/reserve.repository.js';
import { ReserveService } from '../service/reserve.service.js';
import { InMemoryReserveRepository } from './in-memory-reserve.repository.js';

const CREATED_AT = new Date('2026-03-01T12:00:00.000Z');
const UPDATED_AT = new Date('2026-03-02T08:30:00.000Z');

const prismaError = (code: string): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError(`Erro ${code}`, { code, clientVersion: 'teste' });

const utcMonth = (month: string): Date => new Date(`${month}-01T00:00:00.000Z`);

/** Regras das reservas do mês, com o repositório em memória no lugar do banco. */
describe('ReserveService', () => {
    let repository: InMemoryReserveRepository;
    let service: ReserveService;

    beforeEach(() => {
        repository = new InMemoryReserveRepository();
        service = new ReserveService(repository as unknown as ReserveRepository);
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    const INVALID_AMOUNT = { code: 'RESERVE_INVALID_AMOUNT', statusCode: 400, reason: 'reserve_amount_invalid' };
    const NOT_FOUND = { code: 'RESERVE_NOT_FOUND', statusCode: 404, reason: 'reserve_month_not_found' };
    const MONTH_CONFLICT = { code: 'RESERVE_MONTH_CONFLICT', statusCode: 409, reason: 'reserve_month_already_exists' };

    describe('create', () => {
        it('lança o mesmo valor em vários meses do ano, em centavos, e devolve em ordem de mês', async () => {
            const createMany = jest.spyOn(repository, 'createMany');

            const created = await service.create({ year: 2026, months: [12, 2, 8], amount: '4500.5' });

            expect(createMany).toHaveBeenCalledWith([
                { month: utcMonth('2026-12'), amountCents: 450050n },
                { month: utcMonth('2026-02'), amountCents: 450050n },
                { month: utcMonth('2026-08'), amountCents: 450050n }
            ]);
            expect(created.map(reserve => [reserve.month, reserve.amount])).toEqual([
                ['2026-02', '4500.50'],
                ['2026-08', '4500.50'],
                ['2026-12', '4500.50']
            ]);
            expect(Object.keys(created[0]).sort()).toEqual(['amount', 'createdAt', 'id', 'month', 'updatedAt']);
            expect(repository.reserves.size).toBe(3);
        });

        it('janeiro e dezembro caem no dia 1 do mês certo, em UTC', async () => {
            await service.create({ year: 2027, months: [1, 12], amount: '10' });

            expect([...repository.reserves.values()].map(reserve => reserve.month.toISOString())).toEqual([
                '2027-01-01T00:00:00.000Z',
                '2027-12-01T00:00:00.000Z'
            ]);
        });

        it('recusa valor zero ou que não cabe em centavos antes de consultar o banco', async () => {
            const findByMonths = jest.spyOn(repository, 'findByMonths');

            for (const amount of ['0', '0.00', '92233720368547758.08', 'abc']) {
                await expectAppError(service.create({ year: 2026, months: [1], amount }), INVALID_AMOUNT);
            }

            expect(findByMonths).not.toHaveBeenCalled();
            expect(repository.reserves.size).toBe(0);
        });

        it('aceita o maior valor que cabe em centavos', async () => {
            const [created] = await service.create({ year: 2026, months: [1], amount: '92233720368547758.07' });

            expect(created.amount).toBe('92233720368547758.07');
            expect(repository.reserves.get(utcMonth('2026-01').toISOString())?.amountCents).toBe(9_223_372_036_854_775_807n);
        });

        it('se algum mês já tem reserva, recusa todos (409) sem gravar nada', async () => {
            repository.seed('2026-08', 100000n);
            const createMany = jest.spyOn(repository, 'createMany');

            await expectAppError(service.create({ year: 2026, months: [7, 8, 9], amount: '1000.00' }), MONTH_CONFLICT);
            expect(createMany).not.toHaveBeenCalled();
            expect(repository.reserves.size).toBe(1);
        });

        it('mês de outro ano não conta como conflito', async () => {
            repository.seed('2025-08', 100000n);

            await expect(service.create({ year: 2026, months: [8], amount: '1000.00' })).resolves.toHaveLength(1);
            expect(repository.reserves.size).toBe(2);
        });

        it('traduz a violação de unicidade do banco (corrida entre duas criações) para 409', async () => {
            jest.spyOn(repository, 'createMany').mockRejectedValueOnce(prismaError('P2002'));

            await expectAppError(service.create({ year: 2026, months: [3], amount: '1000.00' }), MONTH_CONFLICT);
        });

        it('deixa passar outros erros sem mascarar: de conexão, outro código do Prisma ou um P2002 que não é do Prisma', async () => {
            const failures = [
                new Error('conexão caiu'),
                prismaError('P2025'),
                Object.assign(new Error('parecido'), { code: 'P2002' })
            ];

            for (const failure of failures) {
                jest.spyOn(repository, 'createMany').mockRejectedValueOnce(failure);

                await expect(service.create({ year: 2026, months: [3], amount: '1000.00' })).rejects.toBe(failure);
            }
        });
    });

    describe('findAll', () => {
        beforeEach(() => {
            repository.seed('2027-01', 300n);
            repository.seed('2026-12', 200n);
            repository.seed('2025-12', 50n);
            repository.seed('2026-01', 100n);
        });

        it('sem ano, lista todas em ordem de mês', async () => {
            const findAll = jest.spyOn(repository, 'findAll');

            const months = (await service.findAll({})).map(reserve => reserve.month);

            expect(findAll).toHaveBeenCalledWith(undefined);
            expect(months).toEqual(['2025-12', '2026-01', '2026-12', '2027-01']);
        });

        it('com ano, pede ao banco de 1º de janeiro (inclusive) até 1º de janeiro do ano seguinte (exclusive)', async () => {
            const findAll = jest.spyOn(repository, 'findAll');

            const reserves = await service.findAll({ year: 2026 });

            expect(findAll).toHaveBeenCalledWith({ start: utcMonth('2026-01'), end: utcMonth('2027-01') });
            expect(reserves.map(reserve => [reserve.month, reserve.amount])).toEqual([
                ['2026-01', '1.00'],
                ['2026-12', '2.00']
            ]);
        });
    });

    describe('totals', () => {
        it('sem reservas: total "0.00", contagem zero e nenhum ano', async () => {
            await expect(service.totals()).resolves.toEqual({ total: '0.00', count: 0, byYear: [] });
        });

        it('soma o histórico e cada ano (em centavos, sem erro de arredondamento), só dos anos com reserva', async () => {
            repository.seed('2024-12', 10n);
            repository.seed('2026-01', 20n);
            repository.seed('2026-02', 1n);
            repository.seed('2026-12', 50000n);

            await expect(service.totals()).resolves.toEqual({
                total: '500.31',
                count: 4,
                byYear: [
                    { year: 2024, amount: '0.10', count: 1 },
                    { year: 2026, amount: '500.21', count: 3 }
                ]
            });
        });

        it('agrupa pelo ano em UTC e devolve os anos em ordem crescente, mesmo se o banco mandar fora de ordem', async () => {
            jest.spyOn(repository, 'findAllAmounts').mockResolvedValueOnce([
                { month: utcMonth('2026-01'), amountCents: 100n },
                { month: utcMonth('2024-12'), amountCents: 200n },
                { month: utcMonth('2025-06'), amountCents: 300n },
                { month: utcMonth('2024-01'), amountCents: 400n },
                { month: utcMonth('2023-03'), amountCents: 500n }
            ]);

            const totals = await service.totals();

            expect(totals.byYear).toEqual([
                { year: 2023, amount: '5.00', count: 1 },
                { year: 2024, amount: '6.00', count: 2 },
                { year: 2025, amount: '3.00', count: 1 },
                { year: 2026, amount: '1.00', count: 1 }
            ]);
            expect(totals).toMatchObject({ total: '15.00', count: 5 });
        });

        it('soma valores grandes sem perder precisão', async () => {
            repository.seed('2025-01', 9_007_199_254_740_993n);
            repository.seed('2025-02', 7n);

            await expect(service.totals()).resolves.toEqual({
                total: '90071992547410.00',
                count: 2,
                byYear: [{ year: 2025, amount: '90071992547410.00', count: 2 }]
            });
        });
    });

    describe('findByMonth', () => {
        it('devolve a reserva do mês com valor formatado e só os campos públicos', async () => {
            const reserve = repository.seed('2026-08', 1234567n, { createdAt: CREATED_AT, updatedAt: UPDATED_AT });

            await expect(service.findByMonth('2026-08')).resolves.toEqual({
                id: reserve.id,
                month: '2026-08',
                amount: '12345.67',
                createdAt: CREATED_AT,
                updatedAt: UPDATED_AT
            });
        });

        it('procura pelo dia 1 do mês em UTC', async () => {
            const findByMonth = jest.spyOn(repository, 'findByMonth');

            await expectAppError(service.findByMonth('2026-10'), NOT_FOUND);
            expect(findByMonth).toHaveBeenCalledWith(utcMonth('2026-10'));
        });
    });

    describe('update', () => {
        it('troca o valor do mês', async () => {
            repository.seed('2026-08', 100000n);

            const updated = await service.update('2026-08', { amount: '1500.05' });

            expect(updated).toMatchObject({ month: '2026-08', amount: '1500.05' });
            expect(repository.reserves.get(utcMonth('2026-08').toISOString())?.amountCents).toBe(150005n);
        });

        it('recusa valor zero sem tentar gravar', async () => {
            repository.seed('2026-08', 100000n);
            const update = jest.spyOn(repository, 'update');

            await expectAppError(service.update('2026-08', { amount: '0.00' }), INVALID_AMOUNT);
            expect(update).not.toHaveBeenCalled();
            expect(repository.reserves.get(utcMonth('2026-08').toISOString())?.amountCents).toBe(100000n);
        });

        it('mês sem reserva: 404 (o P2025 do Prisma)', async () => {
            await expectAppError(service.update('2026-08', { amount: '10.00' }), NOT_FOUND);
        });

        it('outros erros do banco passam como vieram', async () => {
            const failures = [new Error('conexão caiu'), prismaError('P2002'), Object.assign(new Error('parecido'), { code: 'P2025' })];

            for (const failure of failures) {
                jest.spyOn(repository, 'update').mockRejectedValueOnce(failure);

                await expect(service.update('2026-08', { amount: '10.00' })).rejects.toBe(failure);
            }
        });
    });

    describe('delete', () => {
        it('remove a reserva do mês', async () => {
            repository.seed('2026-08', 100000n);
            repository.seed('2026-09', 100000n);
            const remove = jest.spyOn(repository, 'delete');

            await expect(service.delete('2026-08')).resolves.toBeUndefined();
            expect(remove).toHaveBeenCalledWith(utcMonth('2026-08'));
            expect([...repository.reserves.keys()]).toEqual([utcMonth('2026-09').toISOString()]);
        });

        it('mês sem reserva: 404; outros erros passam como vieram', async () => {
            const failure = new Error('conexão caiu');

            await expectAppError(service.delete('2026-08'), NOT_FOUND);

            jest.spyOn(repository, 'delete').mockRejectedValueOnce(failure);
            await expect(service.delete('2026-08')).rejects.toBe(failure);
        });
    });
});
