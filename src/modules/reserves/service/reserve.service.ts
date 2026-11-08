import { Injectable } from '@nestjs/common';
import { MonthlyReserve, Prisma } from '../../../generated/prisma/client.js';

import { formatAmountCents, parsePositiveAmountCents } from '../../common/money/money.js';
import {
    CreateReserveDto,
    ListReserveDto,
    ReserveResponse,
    ReserveTotalsResponse,
    UpdateReserveDto
} from '../dto/reserve.dto.js';
import { RESERVE_ERRORS } from '../errors/reserve.errors.js';
import { ReserveRepository } from '../repository/reserve.repository.js';

@Injectable()
export class ReserveService {
    public constructor(private readonly reserveRepository: ReserveRepository) { }

    public async create(data: CreateReserveDto): Promise<ReserveResponse[]> {
        const amountCents = this.parseAmount(data.amount);
        const months = data.months.map(month =>
            new Date(Date.UTC(data.year, month - 1, 1))
        );

        const existing = await this.reserveRepository.findByMonths(months);

        if (existing.length > 0) {
            throw RESERVE_ERRORS.monthConflict('reserve_month_already_exists');
        }

        try {
            const created = await this.reserveRepository.createMany(
                months.map(month => ({ month, amountCents }))
            );

            return created
                .sort((first, second) => first.month.getTime() - second.month.getTime())
                .map(reserve => this.toResponse(reserve));
        } catch (error: unknown) {
            this.rethrowMonthConflict(error);
        }
    }

    public async findAll(query: ListReserveDto): Promise<ReserveResponse[]> {
        const period = query.year === undefined
            ? undefined
            : {
                start: new Date(Date.UTC(query.year, 0, 1)),
                end: new Date(Date.UTC(query.year + 1, 0, 1))
            };

        const reserves = await this.reserveRepository.findAll(period);

        return reserves.map(reserve => this.toResponse(reserve));
    }

    /** Soma histórica das reservas e a soma de cada ano. */
    public async totals(): Promise<ReserveTotalsResponse> {
        const reserves = await this.reserveRepository.findAllAmounts();
        const byYear = new Map<number, { amountCents: bigint; count: number }>();

        for (const reserve of reserves) {
            const year = reserve.month.getUTCFullYear();
            const current = byYear.get(year) ?? { amountCents: 0n, count: 0 };

            byYear.set(year, { amountCents: current.amountCents + reserve.amountCents, count: current.count + 1 });
        }

        return {
            total: formatAmountCents(reserves.reduce((total, reserve) => total + reserve.amountCents, 0n)),
            count: reserves.length,
            byYear: [...byYear.entries()]
                .sort(([first], [second]) => first - second)
                .map(([year, total]) => ({ year, amount: formatAmountCents(total.amountCents), count: total.count }))
        };
    }

    public async findByMonth(month: string): Promise<ReserveResponse> {
        const reserve = await this.reserveRepository.findByMonth(
            this.toMonthDate(month)
        );

        if (!reserve) {
            throw RESERVE_ERRORS.notFound('reserve_month_not_found');
        }

        return this.toResponse(reserve);
    }

    public async update(
        month: string,
        data: UpdateReserveDto
    ): Promise<ReserveResponse> {
        const amountCents = this.parseAmount(data.amount);

        try {
            const updated = await this.reserveRepository.update({
                month: this.toMonthDate(month),
                amountCents
            });

            return this.toResponse(updated);
        } catch (error: unknown) {
            this.rethrowNotFound(error);
        }
    }

    public async delete(month: string): Promise<void> {
        try {
            await this.reserveRepository.delete(this.toMonthDate(month));
        } catch (error: unknown) {
            this.rethrowNotFound(error);
        }
    }

    private toMonthDate(month: string): Date {
        const [year, monthNumber] = month.split('-').map(Number);

        return new Date(Date.UTC(year, monthNumber - 1, 1));
    }

    private parseAmount(amount: string): bigint {
        const cents = parsePositiveAmountCents(amount);

        if (cents === null) {
            throw RESERVE_ERRORS.invalidAmount('reserve_amount_invalid');
        }

        return cents;
    }

    private toResponse(reserve: MonthlyReserve): ReserveResponse {
        return {
            id: reserve.id,
            month: reserve.month.toISOString().slice(0, 7),
            amount: formatAmountCents(reserve.amountCents),
            createdAt: reserve.createdAt,
            updatedAt: reserve.updatedAt
        };
    }

    private rethrowMonthConflict(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2002'
        ) {
            throw RESERVE_ERRORS.monthConflict('reserve_month_already_exists');
        }

        throw error;
    }

    private rethrowNotFound(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2025'
        ) {
            throw RESERVE_ERRORS.notFound('reserve_month_not_found');
        }

        throw error;
    }
}
