import type { MonthlyReserve } from '../../../generated/prisma/client';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client';

type ReserveEntry = { month: Date; amountCents: bigint };

const byMonth = (a: MonthlyReserve, b: MonthlyReserve): number => a.month.getTime() - b.month.getTime();

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do ReserveRepository */
/**
 * ReserveRepository em memória, com a mesma unicidade de mês do banco (P2002) e o P2025 do Prisma
 * ao alterar ou apagar um mês sem reserva.
 */
export class InMemoryReserveRepository {
    public readonly reserves = new Map<string, MonthlyReserve>();

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). Mês no formato AAAA-MM. */
    public seed(month: string, amountCents: bigint, data: Partial<MonthlyReserve> = {}): MonthlyReserve {
        const now = new Date();
        const reserve: MonthlyReserve = {
            id: randomUUID(),
            month: new Date(`${month}-01T00:00:00.000Z`),
            amountCents,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.reserves.set(reserve.month.toISOString(), reserve);
        return reserve;
    }

    /** Como o createManyAndReturn: uma só instrução, tudo ou nada, na ordem recebida. */
    public async createMany(entries: ReserveEntry[]): Promise<MonthlyReserve[]> {
        if (entries.some(entry => this.reserves.has(entry.month.toISOString()))) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' });
        }

        return entries.map(entry => this.seed(entry.month.toISOString().slice(0, 7), entry.amountCents));
    }

    public async findByMonths(months: Date[]): Promise<MonthlyReserve[]> {
        const keys = new Set(months.map(month => month.toISOString()));

        return [...this.reserves.values()].filter(reserve => keys.has(reserve.month.toISOString())).sort(byMonth);
    }

    public async findAll(period?: { start: Date; end: Date }): Promise<MonthlyReserve[]> {
        return [...this.reserves.values()]
            .filter(reserve => !period || (reserve.month >= period.start && reserve.month < period.end))
            .sort(byMonth);
    }

    public async findAllAmounts(): Promise<Pick<MonthlyReserve, 'month' | 'amountCents'>[]> {
        return [...this.reserves.values()]
            .sort(byMonth)
            .map(reserve => ({ month: reserve.month, amountCents: reserve.amountCents }));
    }

    public async findByMonth(month: Date): Promise<MonthlyReserve | null> {
        return this.reserves.get(month.toISOString()) ?? null;
    }

    public async update(entry: ReserveEntry): Promise<MonthlyReserve> {
        const reserve = this.require(entry.month);
        const updated: MonthlyReserve = { ...reserve, amountCents: entry.amountCents, updatedAt: new Date() };

        this.reserves.set(entry.month.toISOString(), updated);
        return updated;
    }

    public async delete(month: Date): Promise<MonthlyReserve> {
        const reserve = this.require(month);

        this.reserves.delete(month.toISOString());
        return reserve;
    }

    /** Como o Prisma no update/delete de um registro que não existe. */
    private require(month: Date): MonthlyReserve {
        const reserve = this.reserves.get(month.toISOString());

        if (!reserve) {
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025', clientVersion: 'teste' });
        }

        return reserve;
    }
}
/* eslint-enable @typescript-eslint/require-await */
