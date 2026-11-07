export class ListCardExpensesDto {
    public month!: string;

    public cardId?: string;
}

export class CardExpenseChangesDto {
    public nickname?: string | null;

    public categoryId?: string;

    public personId?: string | null;
}

export class UpdateCardExpensesDto {
    public ids!: string[];

    public changes!: CardExpenseChangesDto;
}

export type CardExpenseResponse = {
    id: string;
    cardId: string;
    importId: string;
    month: string;
    transactionDate: string;
    /** Apelido, quando existir; senão, a descrição original do banco. */
    description: string;
    originalDescription: string;
    nickname: string | null;
    holderName: string | null;
    cardLastDigits: string | null;
    amount: string;
    installment: {
        number: number;
        total: number;
    } | null;
    categoryId: string;
    personId: string | null;
    createdAt: Date;
    updatedAt: Date;
};
