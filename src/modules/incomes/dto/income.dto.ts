export class CreateIncomeDto {
    public year!: number;

    public months!: number[];

    public amount!: string;
}

export class UpdateIncomeDto {
    public amount!: string;
}

export class ListIncomeDto {
    public year?: number;
}

export type IncomeResponse = {
    id: string;
    month: string;
    amount: string;
    createdAt: Date;
    updatedAt: Date;
};
