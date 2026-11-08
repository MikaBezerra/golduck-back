import type { CardExpenseScope } from '../../card-expenses/service/card-expense-scope.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CardExpenseResponse, CardInstallmentDto, SCOPE_PROPERTY } from '../../card-expenses/dto/card-expense.dto.js';
import {
    DATE_PATTERN,
    DATE_TIME_PROPERTY,
    MONEY_PROPERTY,
    MONTH_PROPERTY,
    UUID_PROPERTY
} from '../../common/swagger/api-docs.js';

export class CreateCardImportDto {
    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura, AAAA-MM' })
    public month!: string;

    @ApiPropertyOptional({ type: String, format: 'password', description: 'Senha do PDF protegido (Neon). Não é gravada.' })
    public password?: string;

    /** Texto JSON com a lista de CardImportOverrideDto; só o salvamento usa. */
    public overrides?: string;

    /** Texto JSON com a lista de CardImportExclusionDto; só o salvamento usa. */
    public exclusions?: string;
}

/** Decisão sobre excluir ou restaurar uma compra do arquivo, a partir do mês da fatura. */
export class CardImportExclusionDto {
    @ApiProperty({ type: String, description: 'key devolvida pela pré-visualização' })
    public key!: string;

    @ApiProperty({ type: String, enum: ['exclude', 'restore'], description: 'exclude também serve para manter excluída' })
    public action!: 'exclude' | 'restore';

    @ApiProperty(SCOPE_PROPERTY)
    public scope!: CardExpenseScope;

    @ApiPropertyOptional({ type: Boolean, default: false, description: 'Com exclude: não perguntar de novo quando a compra reaparecer' })
    public remember!: boolean;
}

/** Escolha do usuário para uma compra do arquivo, feita a partir da pré-visualização. */
export class CardImportOverrideDto {
    @ApiProperty({ type: String, example: 'P|2026-09|8|FERREIRA COSTA', description: 'key devolvida pela pré-visualização' })
    public key!: string;

    @ApiProperty({ type: String, minLength: 1, maxLength: 160, nullable: true, example: 'Geladeira' })
    public nickname!: string | null;

    @ApiProperty(UUID_PROPERTY)
    public categoryId!: string;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'null = compartilhada' })
    public personId!: string | null;
}

/** Só para a documentação: o formulário multipart da pré-visualização. */
export class CardImportUploadDto {
    @ApiProperty({ type: String, format: 'binary', description: 'Fatura: .csv para NUBANK e C6, .pdf para NEON (máx. 2 MB)' })
    public file!: unknown;

    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura, AAAA-MM' })
    public month!: string;

    @ApiPropertyOptional({ type: String, format: 'password', description: 'Senha do PDF protegido (Neon). Não é gravada.' })
    public password?: string;
}

/** Só para a documentação: o formulário multipart do salvamento, com as escolhas do usuário. */
export class CardImportSaveUploadDto extends CardImportUploadDto {
    @ApiPropertyOptional({
        type: String,
        maxLength: 256 * 1024,
        example: '[{"key":"P|2026-09|8|FERREIRA COSTA","nickname":"Geladeira","categoryId":"<uuid>","personId":null}]',
        description: 'JSON com até 500 itens no formato CardImportOverrideDto. Cada escolha vale para a linha do mês e as parcelas futuras lançadas por ela.'
    })
    public overrides?: string;

    @ApiPropertyOptional({
        type: String,
        maxLength: 256 * 1024,
        example: '[{"key":"P|2026-09|8|FERREIRA COSTA","action":"exclude","scope":"all","remember":true}]',
        description: 'JSON com até 500 itens no formato CardImportExclusionDto: excluir, manter excluída ou restaurar compras do arquivo.'
    })
    public exclusions?: string;
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

export class CardImportPreviewTransactionDto {
    @ApiProperty({ type: String, example: 'P|2026-08|8|FERREIRA COSTA', description: 'Identificador da compra no arquivo (opaco); usado nos overrides' })
    public key!: string;

    @ApiProperty({ type: String, enum: ['new', 'update'], description: '"new": ainda não existe no mês; "update": já existe e será atualizada' })
    public status!: 'new' | 'update';

    @ApiProperty({ type: String, format: 'date', pattern: DATE_PATTERN, example: '2026-10-26' })
    public transactionDate!: string;

    @ApiProperty({ type: String, description: 'Descrição original do banco' })
    public description!: string;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty({ type: () => CardInstallmentDto, nullable: true })
    public installment!: CardInstallmentDto | null;

    @ApiProperty({ type: String, nullable: true })
    public holderName!: string | null;

    @ApiProperty({ type: String, nullable: true })
    public cardLastDigits!: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Sugestão: o que será gravado sem override' })
    public nickname!: string | null;

    @ApiProperty({ ...UUID_PROPERTY, description: 'Sugestão: o que será gravado sem override' })
    public categoryId!: string;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'Sugestão: o que será gravado sem override (null = compartilhada)' })
    public personId!: string | null;

    @ApiProperty({ type: Number, description: 'Parcelas futuras que esta linha vai lançar' })
    public projectedCount!: number;

    @ApiProperty({ type: Boolean, description: 'A compra fica excluída se for salva sem decisão' })
    public excluded!: boolean;

    @ApiProperty({ type: Boolean, description: 'Excluída e sem "não perguntar de novo": perguntar ao usuário se restaura ou mantém' })
    public askExclusion!: boolean;
}

export class CardImportPreviewResponse {
    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura' })
    public month!: string;

    @ApiProperty({ type: String })
    public fileName!: string;

    @ApiProperty({ type: () => [CardImportPreviewTransactionDto], description: 'Compras do arquivo, na ordem do arquivo' })
    public transactions!: CardImportPreviewTransactionDto[];

    @ApiProperty({
        type: () => [CardExpenseResponse],
        description: 'Despesas do mês que serão apagadas por não estarem no arquivo (as parcelas futuras delas também saem e contam em summary.removed)'
    })
    public removed!: CardExpenseResponse[];

    @ApiProperty({ type: () => CardImportSummary, description: 'Igual ao que o salvamento devolveria agora' })
    public summary!: CardImportSummary;
}
