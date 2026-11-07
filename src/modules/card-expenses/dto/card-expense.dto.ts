import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CardInstallmentDto } from '../../card-imports/dto/card-import.dto';
import {
    DATE_PATTERN,
    DATE_TIME_PROPERTY,
    MONEY_PROPERTY,
    MONTH_PROPERTY,
    UUID_PROPERTY
} from '../../common/swagger/api-docs';

export class ListCardExpensesDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiPropertyOptional(UUID_PROPERTY)
    public cardId?: string;
}

export class CardExpenseChangesDto {
    @ApiPropertyOptional({ type: String, maxLength: 160, nullable: true, description: 'null remove o apelido' })
    public nickname?: string | null;

    @ApiPropertyOptional(UUID_PROPERTY)
    public categoryId?: string;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'null torna a despesa compartilhada' })
    public personId?: string | null;
}

export class UpdateCardExpensesDto {
    @ApiProperty({ type: [String], format: 'uuid', minItems: 1, uniqueItems: true })
    public ids!: string[];

    @ApiProperty({ type: () => CardExpenseChangesDto, description: 'Pelo menos um campo' })
    public changes!: CardExpenseChangesDto;
}

export class CardExpenseResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...UUID_PROPERTY, description: 'Upload que gravou esta linha por último' })
    public importId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura' })
    public month!: string;

    @ApiProperty({ type: String, format: 'date', pattern: DATE_PATTERN, example: '2026-10-26', description: 'Data informada pelo banco' })
    public transactionDate!: string;

    /** Apelido, quando existir; senão, a descrição original do banco. */
    @ApiProperty({ type: String, description: 'Apelido, quando existir; senão, a descrição original do banco' })
    public description!: string;

    @ApiProperty({ type: String })
    public originalDescription!: string;

    @ApiProperty({ type: String, nullable: true })
    public nickname!: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Titular do cartão, quando o banco informa' })
    public holderName!: string | null;

    @ApiProperty({ type: String, nullable: true, example: '1951' })
    public cardLastDigits!: string | null;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty({ type: () => CardInstallmentDto, nullable: true })
    public installment!: CardInstallmentDto | null;

    @ApiProperty(UUID_PROPERTY)
    public categoryId!: string;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'null = compartilhada' })
    public personId!: string | null;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
