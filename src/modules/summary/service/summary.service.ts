import { Injectable } from '@nestjs/common';

import { formatMonth, parseMonth } from '../../common/date/month';
import { formatAmountCents } from '../../common/money/money';
import { SummaryQueryDto, SummaryResponse } from '../dto/summary.dto';
import { SummaryRepository } from '../repository/summary.repository';
import { compareByAmountThenName, mergeGroups, netByParticipant, sumGroups } from './summary.calculator';

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
        const totals = await this.summaryRepository.loadMonth(month);
        const byCategory = mergeGroups(totals.manualByCategory, totals.cardByCategory);
        const byPerson = mergeGroups(totals.manualByPerson, totals.cardByPerson);
        const manual = sumGroups(totals.manualByCategory);
        const card = sumGroups(totals.cardByCategory);
        const expensesCents = manual.amountCents + card.amountCents;
        const incomeCents = totals.incomeCents ?? 0n;

        const personIds = byPerson.map(group => group.key).filter((key): key is string => key !== null);
        const [categories, people] = await Promise.all([
            this.summaryRepository.findCategories(byCategory.map(group => group.key as string)),
            this.summaryRepository.findPeople(personIds)
        ]);
        const categoryById = new Map(categories.map(category => [category.id, category]));
        const personById = new Map(people.map(person => [person.id, person]));
        const sharedCents = byPerson.find(group => group.key === null)?.amountCents ?? 0n;
        const individualByPerson = new Map(
            byPerson.filter(group => group.key !== null).map(group => [group.key as string, group.amountCents])
        );
        const participants = people
            .filter(person => person.active)
            .map(person => ({ id: person.id, name: person.name }));

        return {
            month: formatMonth(month),
            income: totals.incomeCents === null ? null : formatAmountCents(totals.incomeCents),
            expensesTotal: formatAmountCents(expensesCents),
            expensesCount: manual.count + card.count,
            balance: formatAmountCents(incomeCents - expensesCents),
            bySource: {
                manual: { amount: formatAmountCents(manual.amountCents), count: manual.count },
                card: { amount: formatAmountCents(card.amountCents), count: card.count }
            },
            byCategory: byCategory
                .map(group => {
                    const category = categoryById.get(group.key as string);

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
            byPerson: byPerson
                .map(group => {
                    const person = group.key === null ? null : personById.get(group.key) ?? null;

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
            netByPerson: netByParticipant(incomeCents, sharedCents, participants, individualByPerson)
                .map(item => ({
                    personId: item.participant.id,
                    name: item.participant.name,
                    share: formatAmountCents(item.shareCents),
                    individual: formatAmountCents(item.individualCents),
                    net: formatAmountCents(item.netCents)
                }))
        };
    }
}
