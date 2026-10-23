export class CreateManualExpenseDto {
    public month!: string;

    public title!: string;

    public amount!: string;

    public categoryId?: string;

    public personId?: string | null;

    public replicateUntilYearEnd?: boolean;
}

export class ManualExpenseChangesDto {
    public title?: string;

    public amount?: string;

    public categoryId?: string;

    public personId?: string | null;
}

export class UpdateManualExpensesDto {
    public ids!: string[];

    public changes!: ManualExpenseChangesDto;
}

export class DeleteManualExpensesDto {
    public ids!: string[];
}

export class ListManualExpensesDto {
    public month!: string;
}

export type ManualExpenseResponse = {
    id: string;
    month: string;
    title: string;
    amount: string;
    categoryId: string;
    personId: string | null;
    createdAt: Date;
    updatedAt: Date;
};
