import type { ChosenSplit } from '../../common/expense-split/expense-split.js';
import { ApiProperty, ApiPropertyOptional, ApiPropertyOptions } from '@nestjs/swagger';

import { ExpenseSplit } from '../../../generated/prisma/client.js';

import { CHOSEN_SPLIT_PROPERTY } from '../../common/expense-split/expense-split.js';
import { DATE_TIME_PROPERTY, MONEY_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs.js';

const IDS_PROPERTY: ApiPropertyOptions = { type: [String], format: 'uuid', minItems: 1, uniqueItems: true };

export class CreateManualExpenseDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: String, maxLength: 160, example: 'Internet' })
    public title!: string;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty(CHOSEN_SPLIT_PROPERTY)
    public split!: ChosenSplit;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'Obrigatório com split PERSONAL; com SHARED, omitido ou null' })
    public personId?: string | null;

    @ApiPropertyOptional({ type: Boolean, description: 'Cria uma despesa independente em cada mês até dezembro' })
    public replicateUntilYearEnd?: boolean;
}

export class ManualExpenseChangesDto {
    @ApiPropertyOptional({ type: String, maxLength: 160 })
    public title?: string;

    @ApiPropertyOptional(MONEY_PROPERTY)
    public amount?: string;

    @ApiPropertyOptional(CHOSEN_SPLIT_PROPERTY)
    public split?: ChosenSplit;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'Obrigatório com split PERSONAL; nos outros casos, omitido ou null' })
    public personId?: string | null;

    @ApiPropertyOptional({ type: Boolean, description: 'true marca como paga (agora); false desmarca' })
    public paid?: boolean;
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

/** Resumo das despesas do mês: total, pago e a pagar. */
export class ManualExpensesSummaryResponse {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma de todas as despesas do mês' })
    public total!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma das despesas marcadas como pagas' })
    public paid!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma das despesas ainda não pagas' })
    public unpaid!: string;

    @ApiProperty({ type: Number, description: 'Quantidade de despesas do mês' })
    public count!: number;
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

    @ApiProperty({ ...CHOSEN_SPLIT_PROPERTY, enum: ExpenseSplit, description: 'SHARED ou PERSONAL (despesa manual nunca fica PENDING)' })
    public split!: ExpenseSplit;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'Só na despesa individual (PERSONAL)' })
    public personId!: string | null;

    @ApiProperty({ ...DATE_TIME_PROPERTY, nullable: true, description: 'Quando foi marcada como paga; null = não paga' })
    public paidAt!: Date | null;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
