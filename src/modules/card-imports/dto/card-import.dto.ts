import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
    DATE_PATTERN,
    DATE_TIME_PROPERTY,
    MONEY_PROPERTY,
    MONTH_PROPERTY,
    UUID_PROPERTY
} from '../../common/swagger/api-docs';

export class CreateCardImportDto {
    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura, AAAA-MM' })
    public month!: string;

    @ApiPropertyOptional({ type: String, format: 'password', description: 'Senha do PDF protegido (Neon). Não é gravada.' })
    public password?: string;
}

/** Só para a documentação: o formulário multipart completo do upload. */
export class CardImportUploadDto extends CreateCardImportDto {
    @ApiProperty({ type: String, format: 'binary', description: 'Fatura: .csv para NUBANK e C6, .pdf para NEON (máx. 2 MB)' })
    public file!: unknown;
}

export class CardInstallmentDto {
    @ApiProperty({ type: Number, minimum: 1, maximum: 99, example: 3 })
    public number!: number;

    @ApiProperty({ type: Number, minimum: 1, maximum: 99, example: 10 })
    public total!: number;
}

export class ManualCardTransactionDto {
    @ApiProperty({ type: String, format: 'date', pattern: DATE_PATTERN, example: '2026-10-18', description: 'Data da compra' })
    public date!: string;

    @ApiProperty({ type: String, maxLength: 200, example: 'AMAZON BR' })
    public description!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Valor da parcela deste mês em reais' })
    public amount!: string;

    @ApiPropertyOptional({ type: () => CardInstallmentDto, nullable: true, description: 'Parcela deste mês; omitido ou null para compra à vista' })
    public installment?: CardInstallmentDto | null;

    @ApiPropertyOptional({ type: String, pattern: '^\\d{4}$', nullable: true, example: '0192' })
    public cardLastDigits?: string | null;
}

export class CreateManualCardImportDto {
    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura, AAAA-MM' })
    public month!: string;

    @ApiProperty({ type: () => [ManualCardTransactionDto], maxItems: 500 })
    public transactions!: ManualCardTransactionDto[];
}

export class ListCardImportsDto {
    @ApiPropertyOptional(UUID_PROPERTY)
    public cardId?: string;

    @ApiPropertyOptional(MONTH_PROPERTY)
    public month?: string;
}

export class CardImportResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: String, example: 'Nubank_2026-12-02.csv', description: '"Lançamento manual" para faturas digitadas' })
    public fileName!: string;

    @ApiProperty({ type: String, example: 'nubank-csv@1' })
    public parserVersion!: string;

    @ApiProperty({ type: Number, description: 'Compras consideradas' })
    public rowCount!: number;

    @ApiProperty({ type: Number, description: 'Linhas ignoradas (pagamentos e estornos)' })
    public ignoredCount!: number;

    /** Despesas cuja última gravação veio deste upload; são as que a exclusão remove. */
    @ApiProperty({ type: Number, description: 'Despesas gravadas por último por este upload; a exclusão remove essas' })
    public expenseCount!: number;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;
}

export class CardImportSummary {
    @ApiProperty({ type: Number, description: 'Compras novas no mês da fatura' })
    public created!: number;

    @ApiProperty({ type: Number, description: 'Compras do mês reconhecidas e atualizadas' })
    public updated!: number;

    @ApiProperty({ type: Number, description: 'Linhas removidas (compras que sumiram e suas parcelas futuras)' })
    public removed!: number;

    @ApiProperty({ type: Number, description: 'Parcelas futuras criadas ou atualizadas' })
    public projected!: number;

    @ApiProperty({ type: Number, description: 'Linhas ignoradas do arquivo' })
    public ignored!: number;
}

export class CardImportResultResponse {
    @ApiProperty({ type: () => CardImportResponse })
    public import!: CardImportResponse;

    @ApiProperty({ type: () => CardImportSummary })
    public summary!: CardImportSummary;
}
