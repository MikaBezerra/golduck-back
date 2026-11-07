export class CreateCardImportDto {
    public cardId!: string;

    public month!: string;

    public password?: string;
}

export class ManualCardTransactionDto {
    /** Data da compra, AAAA-MM-DD. */
    public date!: string;

    public description!: string;

    /** Valor da parcela deste mês em reais, por exemplo "120.50". */
    public amount!: string;

    /** Parcela deste mês; omitido ou null para compra à vista. */
    public installment?: { number: number; total: number } | null;

    public cardLastDigits?: string | null;
}

export class CreateManualCardImportDto {
    public cardId!: string;

    public month!: string;

    public transactions!: ManualCardTransactionDto[];
}

export class ListCardImportsDto {
    public cardId?: string;

    public month?: string;
}

export type CardImportResponse = {
    id: string;
    cardId: string;
    month: string;
    fileName: string;
    parserVersion: string;
    rowCount: number;
    ignoredCount: number;
    /** Despesas cuja última gravação veio deste upload; são as que a exclusão remove. */
    expenseCount: number;
    createdAt: Date;
};

export type CardImportSummary = {
    created: number;
    updated: number;
    removed: number;
    projected: number;
    ignored: number;
};

export type CardImportResultResponse = {
    import: CardImportResponse;
    summary: CardImportSummary;
};
