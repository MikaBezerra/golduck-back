import type { CardExpense, CardImport } from '../../../generated/prisma/client.js';
import type {
    ApplyCardImportInput,
    CardImportWithCount,
    PlanningContext,
    PurchaseExclusionDecision
} from '../repository/card-import.repository.js';
import type { CardImportPlan } from '../service/card-import.planner.js';
import { randomUUID } from 'node:crypto';

/*
 * CardImportRepository em memória, com as mesmas regras do real: o contexto do plano é lido das
 * despesas guardadas, o upload e a conciliação são gravados juntos (se algo falhar no meio,
 * nada fica gravado), as decisões de exclusão valem para o escopo pedido e apagar o upload
 * apaga as despesas gravadas por ele (onDelete: Cascade).
 */

type Store = {
    imports: Map<string, CardImport>;
    expenses: Map<string, CardExpense>;
};

/* eslint-disable @typescript-eslint/require-await -- imita a interface assíncrona do CardImportRepository */
export class InMemoryCardImportRepository {
    public imports = new Map<string, CardImport>();
    public expenses = new Map<string, CardExpense>();

    /** Cadastra um upload direto, sem passar pelo serviço (monta o cenário do teste). */
    public seedImport(data: Partial<CardImport> & Pick<CardImport, 'cardId' | 'month'>): CardImport {
        const cardImport: CardImport = {
            id: randomUUID(),
            fileName: 'fatura.csv',
            fileHash: 'a'.repeat(64),
            parserVersion: 'nubank-csv@1',
            rowCount: 0,
            ignoredCount: 0,
            createdAt: new Date(),
            ...data
        };
        this.imports.set(cardImport.id, cardImport);
        return cardImport;
    }

    /** Cadastra uma despesa do cartão direto (monta o cenário do teste). */
    public seedExpense(
        data: Partial<CardExpense> & Pick<CardExpense, 'cardId' | 'month' | 'purchaseKey' | 'categoryId'>
    ): CardExpense {
        const now = new Date();
        const expense: CardExpense = {
            id: randomUUID(),
            importId: null,
            origin: 'UPLOAD',
            externalId: null,
            sourceMonth: data.month,
            transactionDate: data.month,
            originalDescription: 'Compra',
            holderName: null,
            cardLastDigits: null,
            amountCents: 1000n,
            installmentNumber: null,
            installmentTotal: null,
            nickname: null,
            personId: null,
            excludedAt: null,
            exclusionRemembered: false,
            createdAt: now,
            updatedAt: now,
            ...data
        };
        this.expenses.set(expense.id, expense);
        return expense;
    }

    public async loadPlanningContext(cardId: string, month: Date, purchaseKeys: string[]): Promise<PlanningContext> {
        return this.readPlanningContext({ imports: this.imports, expenses: this.expenses }, cardId, month, purchaseKeys);
    }

    /** Como a transação do banco: trabalha numa cópia e só troca o estado no fim. */
    public async apply(input: ApplyCardImportInput): Promise<{ cardImport: CardImport; plan: CardImportPlan }> {
        const store: Store = { imports: new Map(this.imports), expenses: new Map(this.expenses) };
        const now = new Date();
        const cardImport: CardImport = { id: randomUUID(), ...input.data, createdAt: now };

        store.imports.set(cardImport.id, cardImport);

        const plan = input.plan(this.readPlanningContext(store, input.data.cardId, input.data.month, input.purchaseKeys));

        for (const id of plan.deleteIds) {
            store.expenses.delete(id);
        }

        for (const update of plan.updates) {
            const current = store.expenses.get(update.id);

            if (!current) {
                throw new Error(`despesa ${update.id} não existe`);
            }

            store.expenses.set(update.id, { ...current, ...update.data, importId: cardImport.id, origin: 'UPLOAD', updatedAt: now });
        }

        for (const row of plan.creates) {
            const id = randomUUID();
            store.expenses.set(id, { ...row, id, importId: cardImport.id, origin: 'UPLOAD', externalId: null, createdAt: now, updatedAt: now });
        }

        for (const decision of input.exclusions ?? []) {
            this.applyExclusion(store, input.data.cardId, input.data.month, decision, now);
        }

        this.imports = store.imports;
        this.expenses = store.expenses;

        return { cardImport, plan };
    }

    public async findAll(filter: { cardId?: string; month?: Date }): Promise<CardImportWithCount[]> {
        return [...this.imports.values()]
            .filter(cardImport => filter.cardId === undefined || cardImport.cardId === filter.cardId)
            .filter(cardImport => filter.month === undefined || cardImport.month.getTime() === filter.month.getTime())
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
            .map(cardImport => this.withCount(cardImport));
    }

    public async findById(id: string): Promise<CardImportWithCount | null> {
        const cardImport = this.imports.get(id);

        return cardImport ? this.withCount(cardImport) : null;
    }

    public async delete(id: string): Promise<void> {
        if (!this.imports.delete(id)) {
            throw new Error(`upload ${id} não existe`);
        }

        for (const expense of [...this.expenses.values()]) {
            if (expense.importId === id) {
                this.expenses.delete(expense.id);
            }
        }
    }

    /** Despesas do cartão em ordem de mês (facilita conferir o resultado). */
    public expensesOf(cardId: string): CardExpense[] {
        return [...this.expenses.values()]
            .filter(expense => expense.cardId === cardId)
            .sort((a, b) => a.month.getTime() - b.month.getTime() || a.purchaseKey.localeCompare(b.purchaseKey));
    }

    private withCount(cardImport: CardImport): CardImportWithCount {
        const expenseCount = [...this.expenses.values()].filter(expense => expense.importId === cardImport.id).length;

        return { ...cardImport, expenseCount };
    }

    private readPlanningContext(store: Store, cardId: string, month: Date, purchaseKeys: string[]): PlanningContext {
        const rows = [...store.expenses.values()].filter(expense => expense.cardId === cardId);
        const monthKeys = rows
            .filter(row => row.month.getTime() === month.getTime() && row.origin !== 'MANUAL')
            .map(row => row.purchaseKey);
        const keys = new Set([...purchaseKeys, ...monthKeys]);
        const later = [...store.imports.values()]
            .filter(cardImport => cardImport.cardId === cardId && cardImport.month.getTime() > month.getTime())
            .sort((a, b) => a.month.getTime() - b.month.getTime());

        return {
            existing: rows.filter(row => keys.has(row.purchaseKey)),
            nextImportedMonth: later[0]?.month ?? null
        };
    }

    private applyExclusion(store: Store, cardId: string, month: Date, decision: PurchaseExclusionDecision, now: Date): void {
        const inScope = (expense: CardExpense): boolean => {
            const time = expense.month.getTime();

            return expense.cardId === cardId
                && expense.purchaseKey === decision.purchaseKey
                && (decision.scope === 'all'
                    || (decision.scope === 'month' && time === month.getTime())
                    || (decision.scope === 'forward' && time >= month.getTime())
                    || (decision.scope === 'backward' && time <= month.getTime()));
        };

        for (const expense of [...store.expenses.values()].filter(inScope)) {
            store.expenses.set(expense.id, decision.action === 'exclude'
                ? { ...expense, excludedAt: expense.excludedAt ?? now, exclusionRemembered: decision.remember }
                : { ...expense, excludedAt: null, exclusionRemembered: false });
        }
    }
}
/* eslint-enable @typescript-eslint/require-await */
