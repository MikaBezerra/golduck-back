import type { Category, Person } from '../../../generated/prisma/client';
import { Injectable } from '@nestjs/common';

import { addMonths, formatMonth, parseMonth } from '../../common/date/month';
import { formatAmountCents } from '../../common/money/money';
import {
    AnnualSummaryQueryDto,
    AnnualSummaryResponse,
    SummaryQueryDto,
    SummaryResponse,
    SummaryTotalsDto
} from '../dto/summary.dto';
import { SummaryRepository } from '../repository/summary.repository';
import {
    combinePeriods,
    compareByAmountThenName,
    computeMonth,
    MonthGroups,
    Participant,
    PeriodTotals
} from './summary.calculator';

type Lookups = {
    categoryById: ReadonlyMap<string, Category>;
    personById: ReadonlyMap<string, Person>;
    participants: Participant[];
};

const MONTHS_IN_YEAR = 12;

@Injectable()
export class SummaryService {
    public constructor(private readonly summaryRepository: SummaryRepository) { }

    /**
     * Resumo do mês: entrada, despesas fora do cartão e do cartão (pelo mês da fatura,
     * sem as excluídas), saldo, totais por categoria e por pessoa e o líquido de cada
     * pessoa ativa. Todas as contas são feitas em centavos.
     */
    public async findByMonth(query: SummaryQueryDto): Promise<SummaryResponse> {
        const month = parseMonth(query.month);
        const groups = await this.summaryRepository.loadMonths(month, 1);
        const lookups = await this.loadLookups(groups);

        return {
            month: formatMonth(month),
            ...this.toTotalsResponse(computeMonth(groups[0], lookups.participants), lookups)
        };
    }

    /**
     * Resumo do ano: os mesmos totais do mensal somados nos 12 meses, mais a lista dos
     * meses para gráficos. O líquido de cada pessoa é a soma dos líquidos mensais.
     */
    public async findByYear(query: AnnualSummaryQueryDto): Promise<AnnualSummaryResponse> {
        const start = new Date(Date.UTC(query.year, 0, 1));
        const groups = await this.summaryRepository.loadMonths(start, MONTHS_IN_YEAR);
        const lookups = await this.loadLookups(groups);
        const months = groups.map(month => computeMonth(month, lookups.participants));

        return {
            year: query.year,
            ...this.toTotalsResponse(combinePeriods(months, lookups.participants), lookups),
            months: months.map((month, index) => ({
                month: formatMonth(addMonths(start, index)),
                income: month.incomeCents === null ? null : formatAmountCents(month.incomeCents),
                reserve: month.reserveCents === null ? null : formatAmountCents(month.reserveCents),
                expensesTotal: formatAmountCents(month.expensesCents),
                expensesCount: month.expensesCount,
                balance: formatAmountCents(month.balanceCents)
            }))
        };
    }

    /** Nomes das categorias e pessoas que aparecem no período e as pessoas ativas. */
    private async loadLookups(groups: MonthGroups[]): Promise<Lookups> {
        const categoryIds = new Set<string>();
        const personIds = new Set<string>();

        for (const month of groups) {
            [...month.manualByCategory, ...month.cardByCategory].forEach(group => categoryIds.add(group.key as string));
            [...month.manualByPerson, ...month.cardByPerson]
                .filter(group => group.key !== null)
                .forEach(group => personIds.add(group.key as string));
        }

        const [categories, people] = await Promise.all([
            this.summaryRepository.findCategories([...categoryIds]),
            this.summaryRepository.findPeople([...personIds])
        ]);

        return {
            categoryById: new Map(categories.map(category => [category.id, category])),
            personById: new Map(people.map(person => [person.id, person])),
            participants: people
                .filter(person => person.active)
                .map(person => ({ id: person.id, name: person.name }))
        };
    }

    private toTotalsResponse(totals: PeriodTotals, lookups: Lookups): SummaryTotalsDto {
        return {
            income: totals.incomeCents === null ? null : formatAmountCents(totals.incomeCents),
            reserve: totals.reserveCents === null ? null : formatAmountCents(totals.reserveCents),
            expensesTotal: formatAmountCents(totals.expensesCents),
            expensesCount: totals.expensesCount,
            balance: formatAmountCents(totals.balanceCents),
            bySource: {
                manual: { amount: formatAmountCents(totals.manual.amountCents), count: totals.manual.count },
                card: { amount: formatAmountCents(totals.card.amountCents), count: totals.card.count }
            },
            byCategory: totals.byCategory
                .map(group => {
                    const category = lookups.categoryById.get(group.key as string);

                    return { group, name: category?.name ?? '', active: category?.active ?? false };
                })
                .sort((first, second) => compareByAmountThenName(
                    { amountCents: first.group.amountCents, name: first.name },
                    { amountCents: second.group.amountCents, name: second.name }
                ))
                .map(({ group, name, active }) => ({
                    categoryId: group.key as string,
                    name,
                    active,
                    amount: formatAmountCents(group.amountCents),
                    count: group.count
                })),
            byPerson: totals.byPerson
                .map(group => {
                    const person = group.key === null ? null : lookups.personById.get(group.key) ?? null;

                    return { group, name: person?.name ?? null, active: person ? person.active : null };
                })
                .sort((first, second) => compareByAmountThenName(
                    { amountCents: first.group.amountCents, name: first.name },
                    { amountCents: second.group.amountCents, name: second.name }
                ))
                .map(({ group, name, active }) => ({
                    personId: group.key,
                    name,
                    active,
                    amount: formatAmountCents(group.amountCents),
                    count: group.count
                })),
            netByPerson: totals.nets.map(item => ({
                personId: item.participant.id,
                name: item.participant.name,
                share: formatAmountCents(item.shareCents),
                individual: formatAmountCents(item.individualCents),
                net: formatAmountCents(item.netCents)
            }))
        };
    }
}
