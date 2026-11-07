import type { MonthlyIncome } from '../../../generated/prisma/client';
import { randomUUID } from 'node:crypto';

import { Prisma } from '../../../generated/prisma/client';

type IncomeEntry = { month: Date; amountCents: bigint };

const byMonth = (a: MonthlyIncome, b: MonthlyIncome): number => a.month.getTime() - b.month.getTime();

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do IncomeRepository */
/**
 * IncomeRepository em memória, com a mesma unicidade de mês do banco (P2002) e o P2025 do Prisma
 * ao alterar ou apagar um mês sem entrada.
 */
export class InMemoryIncomeRepository {
    public readonly incomes = new Map<string, MonthlyIncome>();

    /** Cadastra direto, sem passar pelo serviço (monta o cenário do teste). Mês no formato AAAA-MM. */
    public seed(month: string, amountCents: bigint, data: Partial<MonthlyIncome> = {}): MonthlyIncome {
        const now = new Date();
        const income: MonthlyIncome = {
            id: randomUUID(),
            month: new Date(`${month}-01T00:00:00.000Z`),
            amountCents,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.incomes.set(income.month.toISOString(), income);
        return income;
    }

    /** Como o createManyAndReturn: uma só instrução, tudo ou nada, na ordem recebida. */
    public async createMany(entries: IncomeEntry[]): Promise<MonthlyIncome[]> {
        if (entries.some(entry => this.incomes.has(entry.month.toISOString()))) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' });
        }

        return entries.map(entry => this.seed(entry.month.toISOString().slice(0, 7), entry.amountCents));
    }

    public async findByMonths(months: Date[]): Promise<MonthlyIncome[]> {
        const keys = new Set(months.map(month => month.toISOString()));

        return [...this.incomes.values()].filter(income => keys.has(income.month.toISOString())).sort(byMonth);
    }

    public async findAll(period?: { start: Date; end: Date }): Promise<MonthlyIncome[]> {
        return [...this.incomes.values()]
            .filter(income => !period || (income.month >= period.start && income.month < period.end))
            .sort(byMonth);
    }

    public async findByMonth(month: Date): Promise<MonthlyIncome | null> {
        return this.incomes.get(month.toISOString()) ?? null;
    }

    public async update(entry: IncomeEntry): Promise<MonthlyIncome> {
        const income = this.require(entry.month);
        const updated: MonthlyIncome = { ...income, amountCents: entry.amountCents, updatedAt: new Date() };

        this.incomes.set(entry.month.toISOString(), updated);
        return updated;
    }

    public async delete(month: Date): Promise<MonthlyIncome> {
        const income = this.require(month);

        this.incomes.delete(month.toISOString());
        return income;
    }

    /** Como o Prisma no update/delete de um registro que não existe. */
    private require(month: Date): MonthlyIncome {
        const income = this.incomes.get(month.toISOString());

        if (!income) {
            throw new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025', clientVersion: 'teste' });
        }

        return income;
    }
}
/* eslint-enable @typescript-eslint/require-await */
