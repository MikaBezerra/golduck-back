import type { Category, Person } from '../../../generated/prisma/client.js';
import { jest } from '@jest/globals';

import { SummaryRepository } from '../repository/summary.repository.js';
import { SummaryService } from '../service/summary.service.js';
import { InMemorySummaryRepository } from './in-memory-summary.repository.js';

/**
 * Resumo do mês e do ano com o repositório em memória: confere os valores formatados (texto em
 * reais), a ordenação das listas, os nomes vindos das categorias e pessoas e a divisão do líquido.
 */
describe('SummaryService', () => {
    let repository: InMemorySummaryRepository;
    let service: SummaryService;

    beforeEach(() => {
        repository = new InMemorySummaryRepository();
        service = new SummaryService(repository as unknown as SummaryRepository);
    });

    describe('findByMonth', () => {
        let ana: Person;
        let bruno: Person;
        let carla: Person;
        let moradia: Category;
        let mercado: Category;
        let antiga: Category;

        /*
         * Novembro/2026: entrada 10000.00, reserva 1000.00, despesas fora do cartão e do cartão
         * (uma excluída) e uma despesa de outubro, que não entra. Carla está inativa: aparece em
         * byPerson, mas não participa da divisão.
         */
        beforeEach(() => {
            ana = repository.seedPerson({ name: 'Ana' });
            bruno = repository.seedPerson({ name: 'Bruno' });
            carla = repository.seedPerson({ name: 'Carla', active: false });
            antiga = repository.seedCategory({ name: 'Antiga', active: false });
            mercado = repository.seedCategory({ name: 'Mercado' });
            moradia = repository.seedCategory({ name: 'Moradia' });

            repository.incomes.set('2026-11', 1_000_000n);
            repository.reserves.set('2026-11', 100_000n);
            repository.manualExpenses.push(
                { month: '2026-11', categoryId: antiga.id, personId: carla.id, amountCents: 10_000n },
                { month: '2026-11', categoryId: mercado.id, personId: ana.id, amountCents: 30_050n },
                { month: '2026-11', categoryId: moradia.id, personId: null, amountCents: 200_000n },
                { month: '2026-10', categoryId: moradia.id, personId: null, amountCents: 50_000n }
            );
            repository.cardExpenses.push(
                { month: '2026-11', categoryId: mercado.id, personId: null, amountCents: 19_999n },
                { month: '2026-11', categoryId: mercado.id, personId: bruno.id, amountCents: 5_001n },
                { month: '2026-11', categoryId: moradia.id, personId: ana.id, amountCents: 99_999n, excluded: true }
            );
        });

        it('calcula totais, saldo, listas ordenadas por valor e o líquido de cada pessoa ativa', async () => {
            const summary = await service.findByMonth({ month: '2026-11' });

            expect(summary).toEqual({
                month: '2026-11',
                income: '10000.00',
                reserve: '1000.00',
                expensesTotal: '2650.50',
                expensesCount: 5,
                // 10000.00 − 2650.50 − 1000.00
                balance: '6349.50',
                bySource: {
                    manual: { amount: '2400.50', count: 3 },
                    card: { amount: '250.00', count: 2 }
                },
                byCategory: [
                    { categoryId: moradia.id, name: 'Moradia', active: true, amount: '2000.00', count: 1 },
                    { categoryId: mercado.id, name: 'Mercado', active: true, amount: '550.50', count: 3 },
                    { categoryId: antiga.id, name: 'Antiga', active: false, amount: '100.00', count: 1 }
                ],
                byPerson: [
                    { personId: null, name: null, active: null, amount: '2199.99', count: 2 },
                    { personId: ana.id, name: 'Ana', active: true, amount: '300.50', count: 1 },
                    { personId: carla.id, name: 'Carla', active: false, amount: '100.00', count: 1 },
                    { personId: bruno.id, name: 'Bruno', active: true, amount: '50.01', count: 1 }
                ],
                // (10000.00 − 2199.99 − 1000.00) / 2 = 3400.005: o centavo que sobra vai para Ana.
                netByPerson: [
                    { personId: ana.id, name: 'Ana', share: '3400.01', individual: '300.50', net: '3099.51' },
                    { personId: bruno.id, name: 'Bruno', share: '3400.00', individual: '50.01', net: '3349.99' }
                ]
            });
        });

        it('busca só o mês pedido e só os nomes das categorias e pessoas que aparecem nele', async () => {
            const loadMonths = jest.spyOn(repository, 'loadMonths');
            const findCategories = jest.spyOn(repository, 'findCategories');
            const findPeople = jest.spyOn(repository, 'findPeople');

            await service.findByMonth({ month: '2026-11' });

            expect(loadMonths).toHaveBeenCalledTimes(1);
            expect(loadMonths).toHaveBeenCalledWith(new Date('2026-11-01T00:00:00.000Z'), 1);
            // Sem repetir ids e sem o null das despesas compartilhadas.
            expect(findCategories).toHaveBeenCalledWith([antiga.id, mercado.id, moradia.id]);
            expect(findPeople).toHaveBeenCalledWith([carla.id, ana.id, bruno.id]);
        });

        it('pessoa ativa sem despesas também entra na divisão (com individual zero)', async () => {
            const dani = repository.seedPerson({ name: 'Dani' });

            const summary = await service.findByMonth({ month: '2026-11' });

            // 6800.01 / 3 = 2266.67 exato.
            expect(summary.netByPerson).toEqual([
                { personId: ana.id, name: 'Ana', share: '2266.67', individual: '300.50', net: '1966.17' },
                { personId: bruno.id, name: 'Bruno', share: '2266.67', individual: '50.01', net: '2216.66' },
                { personId: dani.id, name: 'Dani', share: '2266.67', individual: '0.00', net: '2266.67' }
            ]);
            expect(summary.byPerson.map(person => person.name)).not.toContain('Dani');
        });

        it('mês vazio: entrada e reserva null, zeros e listas vazias (a divisão continua com as ativas)', async () => {
            const summary = await service.findByMonth({ month: '2026-12' });

            expect(summary).toEqual({
                month: '2026-12',
                income: null,
                reserve: null,
                expensesTotal: '0.00',
                expensesCount: 0,
                balance: '0.00',
                bySource: { manual: { amount: '0.00', count: 0 }, card: { amount: '0.00', count: 0 } },
                byCategory: [],
                byPerson: [],
                netByPerson: [
                    { personId: ana.id, name: 'Ana', share: '0.00', individual: '0.00', net: '0.00' },
                    { personId: bruno.id, name: 'Bruno', share: '0.00', individual: '0.00', net: '0.00' }
                ]
            });
        });

        it('sem entrada, o saldo e o líquido ficam negativos', async () => {
            repository.manualExpenses.push({ month: '2026-09', categoryId: mercado.id, personId: ana.id, amountCents: 12_345n });
            repository.reserves.set('2026-09', 101n);

            const summary = await service.findByMonth({ month: '2026-09' });

            expect(summary).toMatchObject({ income: null, reserve: '1.01', expensesTotal: '123.45', balance: '-124.46' });
            // (0 − 0 − 1.01) / 2: o centavo negativo que sobra vai para Ana.
            expect(summary.netByPerson).toEqual([
                { personId: ana.id, name: 'Ana', share: '-0.51', individual: '123.45', net: '-123.96' },
                { personId: bruno.id, name: 'Bruno', share: '-0.50', individual: '0.00', net: '-0.50' }
            ]);
        });

        it('categoria ou pessoa que o banco não devolveu fica sem nome (e não quebra o resumo)', async () => {
            jest.spyOn(repository, 'findCategories').mockResolvedValue([]);
            jest.spyOn(repository, 'findPeople').mockResolvedValue([ana]);

            const summary = await service.findByMonth({ month: '2026-11' });

            expect(summary.byCategory).toEqual([
                { categoryId: moradia.id, name: '', active: false, amount: '2000.00', count: 1 },
                { categoryId: mercado.id, name: '', active: false, amount: '550.50', count: 3 },
                { categoryId: antiga.id, name: '', active: false, amount: '100.00', count: 1 }
            ]);
            expect(summary.byPerson).toEqual([
                { personId: null, name: null, active: null, amount: '2199.99', count: 2 },
                { personId: ana.id, name: 'Ana', active: true, amount: '300.50', count: 1 },
                { personId: carla.id, name: null, active: null, amount: '100.00', count: 1 },
                { personId: bruno.id, name: null, active: null, amount: '50.01', count: 1 }
            ]);
            // Só Ana participa: (10000.00 − 2199.99 − 1000.00) inteiro para ela.
            expect(summary.netByPerson).toEqual([
                { personId: ana.id, name: 'Ana', share: '6800.01', individual: '300.50', net: '6499.51' }
            ]);
        });

        it('empate no valor: ordem alfabética, e as despesas compartilhadas (sem nome) por último', async () => {
            const zebra = repository.seedCategory({ name: 'Zebra' });
            const abacate = repository.seedCategory({ name: 'Abacate' });
            const elisa = repository.seedPerson({ name: 'Elisa' });
            const diego = repository.seedPerson({ name: 'Diego' });
            repository.manualExpenses.push(
                { month: '2027-01', categoryId: zebra.id, personId: null, amountCents: 500n },
                { month: '2027-01', categoryId: abacate.id, personId: elisa.id, amountCents: 500n },
                { month: '2027-01', categoryId: zebra.id, personId: diego.id, amountCents: 300n },
                { month: '2027-01', categoryId: abacate.id, personId: null, amountCents: 300n }
            );

            const summary = await service.findByMonth({ month: '2027-01' });

            expect(summary.byCategory.map(category => [category.name, category.amount])).toEqual([
                ['Abacate', '8.00'],
                ['Zebra', '8.00']
            ]);
            expect(summary.byPerson.map(person => [person.name, person.amount])).toEqual([
                [null, '8.00'],
                ['Elisa', '5.00'],
                ['Diego', '3.00']
            ]);

            repository.manualExpenses.push({ month: '2027-02', categoryId: zebra.id, personId: null, amountCents: 700n });
            repository.manualExpenses.push({ month: '2027-02', categoryId: zebra.id, personId: elisa.id, amountCents: 700n });
            repository.manualExpenses.push({ month: '2027-02', categoryId: zebra.id, personId: diego.id, amountCents: 700n });

            const tie = await service.findByMonth({ month: '2027-02' });

            expect(tie.byPerson.map(person => person.name)).toEqual(['Diego', 'Elisa', null]);
        });
    });

    describe('findByYear', () => {
        let ana: Person;
        let bruno: Person;
        let moradia: Category;

        /*
         * 2026: janeiro e março com entrada, março com reserva, dezembro só com despesa.
         * Despesas de dezembro/2025 e janeiro/2027 ficam fora do ano.
         */
        beforeEach(() => {
            ana = repository.seedPerson({ name: 'Ana' });
            bruno = repository.seedPerson({ name: 'Bruno' });
            moradia = repository.seedCategory({ name: 'Moradia' });

            repository.incomes.set('2026-01', 100_001n);
            repository.incomes.set('2026-03', 100_001n);
            repository.incomes.set('2027-01', 999_999n);
            repository.reserves.set('2026-03', 5_000n);
            repository.manualExpenses.push(
                { month: '2025-12', categoryId: moradia.id, personId: null, amountCents: 99_900n },
                { month: '2026-01', categoryId: moradia.id, personId: null, amountCents: 10_000n },
                { month: '2026-12', categoryId: moradia.id, personId: ana.id, amountCents: 1_000n },
                { month: '2027-01', categoryId: moradia.id, personId: null, amountCents: 99_900n }
            );
            repository.cardExpenses.push({ month: '2026-03', categoryId: moradia.id, personId: bruno.id, amountCents: 2_000n });
        });

        it('soma os 12 meses e o líquido de cada pessoa é a soma dos líquidos mensais', async () => {
            const summary = await service.findByYear({ year: 2026 });

            expect(summary).toMatchObject({
                year: 2026,
                income: '2000.02',
                reserve: '50.00',
                expensesTotal: '130.00',
                expensesCount: 3,
                // 900.01 + 930.01 − 10.00
                balance: '1820.02',
                bySource: {
                    manual: { amount: '110.00', count: 2 },
                    card: { amount: '20.00', count: 1 }
                },
                byCategory: [
                    { categoryId: moradia.id, name: 'Moradia', active: true, amount: '130.00', count: 3 }
                ],
                byPerson: [
                    { personId: null, name: null, active: null, amount: '100.00', count: 1 },
                    { personId: bruno.id, name: 'Bruno', active: true, amount: '20.00', count: 1 },
                    { personId: ana.id, name: 'Ana', active: true, amount: '10.00', count: 1 }
                ],
                // Janeiro e março dão um centavo a mais para Ana; dividir o ano inteiro daria 925.01 para cada.
                netByPerson: [
                    { personId: ana.id, name: 'Ana', share: '925.02', individual: '10.00', net: '915.02' },
                    { personId: bruno.id, name: 'Bruno', share: '925.00', individual: '20.00', net: '905.00' }
                ]
            });
        });

        it('lista sempre os 12 meses do ano, com null onde não há entrada ou reserva', async () => {
            const { months } = await service.findByYear({ year: 2026 });
            const empty = { income: null, reserve: null, expensesTotal: '0.00', expensesCount: 0, balance: '0.00' };

            expect(months.map(month => month.month)).toEqual([
                '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
                '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'
            ]);
            expect(months[0]).toEqual({
                month: '2026-01', income: '1000.01', reserve: null, expensesTotal: '100.00', expensesCount: 1, balance: '900.01'
            });
            expect(months[1]).toEqual({ month: '2026-02', ...empty });
            expect(months[2]).toEqual({
                month: '2026-03', income: '1000.01', reserve: '50.00', expensesTotal: '20.00', expensesCount: 1, balance: '930.01'
            });
            expect(months[11]).toEqual({
                month: '2026-12', income: null, reserve: null, expensesTotal: '10.00', expensesCount: 1, balance: '-10.00'
            });
        });

        it('carrega os 12 meses a partir de 1º de janeiro (UTC) do ano pedido', async () => {
            const loadMonths = jest.spyOn(repository, 'loadMonths');

            await service.findByYear({ year: 2026 });

            expect(loadMonths).toHaveBeenCalledTimes(1);
            expect(loadMonths).toHaveBeenCalledWith(new Date('2026-01-01T00:00:00.000Z'), 12);
        });

        it('ano sem nada: entrada e reserva null, zeros e as pessoas ativas com líquido zero', async () => {
            const summary = await service.findByYear({ year: 2030 });

            expect(summary).toMatchObject({
                year: 2030,
                income: null,
                reserve: null,
                expensesTotal: '0.00',
                expensesCount: 0,
                balance: '0.00',
                byCategory: [],
                byPerson: [],
                netByPerson: [
                    { personId: ana.id, name: 'Ana', share: '0.00', individual: '0.00', net: '0.00' },
                    { personId: bruno.id, name: 'Bruno', share: '0.00', individual: '0.00', net: '0.00' }
                ]
            });
            expect(summary.months).toHaveLength(12);
            expect(summary.months.every(month => month.income === null && month.reserve === null)).toBe(true);
        });
    });

    describe('findStatement', () => {
        it('monta a tabela do mês pelo repositório: sem excluídas, com a quebra e a reserva acumulada até o mês', async () => {
            const ana = repository.seedPerson({ name: 'Ana', email: 'ana@exemplo.com' });
            const bruno = repository.seedPerson({ name: 'Bruno' });
            const mercado = repository.seedCategory({ name: 'Mercado' });

            repository.cards.set('nubank', 'Nubank');
            repository.incomes.set('2026-11', 400_000n);
            repository.reserves.set('2026-10', 30_000n);
            repository.reserves.set('2026-11', 20_000n);
            repository.reserves.set('2026-12', 99_900n);
            repository.manualExpenses.push(
                { id: 'aluguel', title: 'Aluguel', month: '2026-11', categoryId: mercado.id, personId: null, amountCents: 100_000n },
                { month: '2026-10', categoryId: mercado.id, personId: null, amountCents: 77_700n }
            );
            repository.cardExpenses.push(
                { id: 'curso', cardId: 'nubank', month: '2026-11', categoryId: mercado.id, personId: ana.id, amountCents: 10_000n },
                { cardId: 'nubank', month: '2026-11', categoryId: mercado.id, personId: bruno.id, amountCents: 55_500n, excluded: true }
            );
            const load = jest.spyOn(repository, 'loadStatementSource');

            const statement = await service.findStatement({ month: '2026-11' });

            expect(load).toHaveBeenCalledWith(new Date('2026-11-01T00:00:00.000Z'));
            expect(statement.month).toBe('2026-11');
            expect(statement.columns.map(column => column.name)).toEqual(['Ana', 'Bruno']);
            // (4000.00 − 1000.00) / 2 = 1500.00 antes da reserva; reserva de 200.00 = 100.00 para cada
            expect(statement.breakdown).toEqual([
                { personId: ana.id, name: 'Ana', beforeReserve: '1500.00', individual: '100.00', reserve: '100.00', net: '1300.00' },
                { personId: bruno.id, name: 'Bruno', beforeReserve: '1500.00', individual: '0.00', reserve: '100.00', net: '1400.00' }
            ]);
            expect(statement.reserve).toEqual({ month: '200.00', accumulated: '500.00' });

            const monthly = await service.findByMonth({ month: '2026-11' });

            expect(monthly.netByPerson.map(item => item.net)).toEqual(statement.breakdown.map(item => item.net));
        });
    });
});
