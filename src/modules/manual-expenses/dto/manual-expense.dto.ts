import { ApiProperty, ApiPropertyOptional, ApiPropertyOptions } from '@nestjs/swagger';

import { DATE_TIME_PROPERTY, MONEY_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs';

const IDS_PROPERTY: ApiPropertyOptions = { type: [String], format: 'uuid', minItems: 1, uniqueItems: true };

export class CreateManualExpenseDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: String, maxLength: 160, example: 'Internet' })
    public title!: string;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiPropertyOptional({ ...UUID_PROPERTY, description: 'Sem categoria, usa a padrão ("Outros")' })
    public categoryId?: string;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'Pessoa da despesa individual; null ou ausente = compartilhada' })
    public personId?: string | null;

    @ApiPropertyOptional({ type: Boolean, description: 'Cria uma despesa independente em cada mês até dezembro' })
    public replicateUntilYearEnd?: boolean;
}

export class ManualExpenseChangesDto {
    @ApiPropertyOptional({ type: String, maxLength: 160 })
    public title?: string;

    @ApiPropertyOptional(MONEY_PROPERTY)
    public amount?: string;

    @ApiPropertyOptional(UUID_PROPERTY)
    public categoryId?: string;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'null torna a despesa compartilhada' })
    public personId?: string | null;
}

export class UpdateManualExpensesDto {
    @ApiProperty(IDS_PROPERTY)
    public ids!: string[];

    @ApiProperty({ type: () => ManualExpenseChangesDto, description: 'Pelo menos um campo' })
    public changes!: ManualExpenseChangesDto;
}

export class DeleteManualExpensesDto {
    @ApiProperty(IDS_PROPERTY)
    public ids!: string[];
}

export class ListManualExpensesDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;
}

export class ManualExpenseResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: String })
    public title!: string;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty(UUID_PROPERTY)
    public categoryId!: string;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'null = compartilhada' })
    public personId!: string | null;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
