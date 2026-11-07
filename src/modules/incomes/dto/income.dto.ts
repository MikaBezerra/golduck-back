import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DATE_TIME_PROPERTY, MONEY_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs';

export class CreateIncomeDto {
    @ApiProperty({ type: Number, example: 2026 })
    public year!: number;

    @ApiProperty({ type: [Number], example: [2, 8, 12], description: 'Meses (1 a 12) do mesmo ano, não precisam ser consecutivos' })
    public months!: number[];

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;
}

export class UpdateIncomeDto {
    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;
}

export class ListIncomeDto {
    @ApiPropertyOptional({ type: Number, example: 2026 })
    public year?: number;
}

export class IncomeResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
