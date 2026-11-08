import type { CardExpense } from '../../../generated/prisma/client.js';
import type { ChosenSplit, SplitAssignment } from '../../common/expense-split/expense-split.js';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { CardExpenseOrigin } from '../../../generated/prisma/client.js';
import { CategoryService } from '../../categories/service/category.service.js';
import { addMonths, parseMonth } from '../../common/date/month.js';
import { parsePositiveAmountCents } from '../../common/money/money.js';
import { CreditCardService } from '../../credit-cards/service/credit-card.service.js';
import { PersonService } from '../../people/service/person.service.js';
import {
    CardExpenseResponse,
    CardExpenseScopeDto,
    CreateCardExpenseDto,
    ListCardExpensesDto,
    MoveCardExpenseDto,
    UpdateCardExpensesDto
} from '../dto/card-expense.dto.js';
import { CARD_EXPENSE_ERRORS } from '../errors/card-expense.errors.js';
import { CardExpenseChanges, CardExpenseRepository, NewCardExpenseRow, PurchaseCorrectionData } from '../repository/card-expense.repository.js';
import { toCardExpenseResponse } from './card-expense.mapper.js';
import { scheduleInstallments } from './purchase-schedule.js';

/** Chave das compras de "Adicionar compra": cada uma é única e não se confunde com as do banco. */
const MANUAL_KEY_PREFIX = 'M|';

@Injectable()
export class CardExpenseService {
    public constructor(
        private readonly cardExpenseRepository: CardExpenseRepository,
        private readonly categoryService: CategoryService,
        private readonly personService: PersonService,
        private readonly creditCardService: CreditCardService
    ) { }

    public async findAll(query: ListCardExpensesDto): Promise<CardExpenseResponse[]> {
        const expenses = await this.cardExpenseRepository.findAll({
            month: parseMonth(query.month),
            cardId: query.cardId,
            includeExcluded: query.includeExcluded,
            split: query.split
        });

        return expenses.map(expense => toCardExpenseResponse(expense));
    }

    public async findById(id: string): Promise<CardExpenseResponse> {
        return toCardExpenseResponse(await this.getById(id));
    }

    /**
     * "Adicionar compra": uma compra que está faltando na fatura. Parcelada, lança também as parcelas
     * seguintes nos meses seguintes. A sincronização nunca apaga essas linhas; quando o banco trouxer
     * a mesma compra, ela substitui a lançada à mão e herda apelido, categoria e pessoa.
     */
    public async create(data: CreateCardExpenseDto): Promise<CardExpenseResponse[]> {
        const card = await this.creditCardService.getActiveById(data.cardId);
        const amountCents = parsePositiveAmountCents(data.amount) as bigint;
        const categoryId = data.categoryId === undefined
            ? (await this.categoryService.findDefault()).id
            : await this.resolveCategoryId(data.categoryId);
        const assignment = await this.resolveSplit(data.split, data.personId);
        const month = parseMonth(data.month);
        const installmentNumber = data.installment?.number ?? 1;
        const installmentTotal = data.installment?.total ?? null;
        const purchaseKey = `${MANUAL_KEY_PREFIX}${randomUUID()}`;
        const rows = scheduleInstallments({ installmentNumber, month, installmentTotal })
            .filter(installment => installment.installmentNumber === null || installment.installmentNumber >= installmentNumber)
            .map((installment): NewCardExpenseRow => ({
                cardId: card.id,
                importId: null,
                origin: CardExpenseOrigin.MANUAL,
                externalId: null,
                month: installment.month,
                sourceMonth: addMonths(month, 1 - installmentNumber),
                purchaseKey,
                transactionDate: new Date(`${data.date}T00:00:00.000Z`),
                originalDescription: data.description.trim().replace(/\s+/g, ' '),
                holderName: null,
                cardLastDigits: null,
                amountCents,
                installmentNumber: installment.installmentNumber,
                installmentTotal,
                nickname: data.nickname ?? null,
                categoryId,
                ...assignment,
                excludedAt: null,
                exclusionRemembered: false
            }));
        const created = await this.cardExpenseRepository.createPurchase(rows);

        return created.map(expense => toCardExpenseResponse(expense));
    }

    /**
     * Corrige em que fatura cai a compra: esta linha passa a ser a parcela informada no mês informado
     * e as outras parcelas seguem a partir dela (a compra inteira muda). Em compras sincronizadas, a
     * correção é gravada e a sincronização passa a respeitá-la; só os meses que ela controla recebem
     * linhas. Compras de upload não mudam (o upload é a fatura do mês).
     */
    public async move(id: string, data: MoveCardExpenseDto): Promise<CardExpenseResponse[]> {
        const expense = await this.getById(id);

        if (expense.origin === CardExpenseOrigin.UPLOAD) {
            throw CARD_EXPENSE_ERRORS.moveNotAllowed('card_expense_from_upload');
        }

        const installmentTotal = data.installmentTotal ?? expense.installmentTotal;
        const installmentNumber = installmentTotal === null ? 1 : data.installmentNumber ?? expense.installmentNumber ?? 1;

        if (installmentTotal !== null && installmentNumber > installmentTotal) {
            throw CARD_EXPENSE_ERRORS.installmentInvalid(`installment_${installmentNumber}_of_${installmentTotal}`);
        }

        const month = parseMonth(data.month);
        const purchase = await this.cardExpenseRepository.findPurchase(expense.cardId, expense.purchaseKey);
        const firstInstallment = Math.min(installmentNumber, ...purchase.map(row => row.installmentNumber ?? 1));
        const syncFromMonth = expense.origin === CardExpenseOrigin.SYNC
            ? (await this.creditCardService.getById(expense.cardId)).syncFromMonth
            : null;
        const rows = scheduleInstallments({ installmentNumber, month, installmentTotal })
            .filter(installment => expense.origin === CardExpenseOrigin.SYNC
                // Sincronizada: as parcelas que o banco manda, mas só nos meses que a sincronização controla.
                ? syncFromMonth === null || installment.month >= syncFromMonth
                // Lançada à mão: a partir da primeira parcela que a compra já tinha.
                : installment.installmentNumber === null || installment.installmentNumber >= firstInstallment)
            .map((installment): NewCardExpenseRow => ({
                ...this.rowData(expense),
                month: installment.month,
                sourceMonth: addMonths(month, 1 - installmentNumber),
                installmentNumber: installment.installmentNumber,
                installmentTotal
            }));
        const correction: PurchaseCorrectionData | null = expense.origin === CardExpenseOrigin.SYNC
            ? { installmentNumber, installmentTotal, month }
            : null;
        const saved = await this.cardExpenseRepository.replacePurchase(expense, rows, correction);

        return saved.map(row => toCardExpenseResponse(row));
    }

    /**
     * Altera apelido, categoria ou pessoa (split) das despesas escolhidas. Em compras
     * parceladas, a alteração vale também para as parcelas seguintes. Escolher a pessoa
     * (ou compartilhada) tira a compra de PENDING.
     */
    public async updateMany(data: UpdateCardExpensesDto): Promise<CardExpenseResponse[]> {
        const expenses = await this.getByIds(data.ids);

        const changes: CardExpenseChanges = {
            nickname: data.changes.nickname,
            categoryId: data.changes.categoryId === undefined
                ? undefined
                : await this.resolveCategoryId(data.changes.categoryId),
            ...(data.changes.split === undefined
                ? {}
                : await this.resolveSplit(data.changes.split, data.changes.personId))
        };
        const updated = await this.cardExpenseRepository.updateWithFollowingInstallments(expenses, changes);

        return updated.map(expense => toCardExpenseResponse(expense));
    }

    /** Exclusão suave das despesas escolhidas, no escopo pedido. */
    public async exclude(data: CardExpenseScopeDto): Promise<void> {
        await this.cardExpenseRepository.exclude(await this.getByIds(data.ids), data.scope);
    }

    /** Desfaz a exclusão no escopo pedido; devolve as linhas restauradas. */
    public async restore(data: CardExpenseScopeDto): Promise<CardExpenseResponse[]> {
        const restored = await this.cardExpenseRepository.restore(await this.getByIds(data.ids), data.scope);

        return restored.map(expense => toCardExpenseResponse(expense));
    }

    /** Os dados da linha que continuam iguais em todas as parcelas recriadas. */
    private rowData(expense: CardExpense): NewCardExpenseRow {
        return {
            cardId: expense.cardId,
            importId: expense.importId,
            origin: expense.origin,
            externalId: expense.externalId,
            month: expense.month,
            sourceMonth: expense.sourceMonth,
            purchaseKey: expense.purchaseKey,
            transactionDate: expense.transactionDate,
            originalDescription: expense.originalDescription,
            holderName: expense.holderName,
            cardLastDigits: expense.cardLastDigits,
            amountCents: expense.amountCents,
            installmentNumber: expense.installmentNumber,
            installmentTotal: expense.installmentTotal,
            nickname: expense.nickname,
            categoryId: expense.categoryId,
            split: expense.split,
            personId: expense.personId,
            excludedAt: expense.excludedAt,
            exclusionRemembered: expense.exclusionRemembered
        };
    }

    private async getById(id: string): Promise<CardExpense> {
        const expense = await this.cardExpenseRepository.findById(id);

        if (!expense) {
            throw CARD_EXPENSE_ERRORS.notFound('card_expense_id_not_found');
        }

        return expense;
    }

    private async getByIds(ids: string[]): Promise<CardExpense[]> {
        const expenses = await this.cardExpenseRepository.findByIds(ids);

        if (expenses.length !== ids.length) {
            throw CARD_EXPENSE_ERRORS.notFound('card_expense_id_not_found');
        }

        return expenses;
    }

    private async resolveCategoryId(categoryId: string): Promise<string> {
        const category = await this.categoryService.findById(categoryId);

        if (!category.active) {
            throw CARD_EXPENSE_ERRORS.inactiveCategory('category_inactive');
        }

        return category.id;
    }

    /** O pipe já garante personId só (e sempre) no PERSONAL; aqui, que a pessoa existe e está ativa. */
    private async resolveSplit(split: ChosenSplit, personId?: string | null): Promise<SplitAssignment> {
        if (split !== 'PERSONAL' || !personId) {
            return { split: 'SHARED', personId: null };
        }

        const person = await this.personService.findById(personId);

        if (!person.active) {
            throw CARD_EXPENSE_ERRORS.inactivePerson('person_inactive');
        }

        return { split, personId: person.id };
    }
}
