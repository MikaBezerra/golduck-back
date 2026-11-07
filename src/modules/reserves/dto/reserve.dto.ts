import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DATE_TIME_PROPERTY, MONEY_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs';

export class CreateReserveDto {
    @ApiProperty({ type: Number, example: 2026 })
    public year!: number;

    @ApiProperty({ type: [Number], example: [2, 8, 12], description: 'Meses (1 a 12) do mesmo ano, não precisam ser consecutivos' })
    public months!: number[];

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;
}

export class UpdateReserveDto {
    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;
}

export class ListReserveDto {
    @ApiPropertyOptional({ type: Number, example: 2026 })
    public year?: number;
}

export class ReserveResponse {
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

export class ReserveYearTotalDto {
    @ApiProperty({ type: Number, example: 2026 })
    public year!: number;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma das reservas do ano' })
    public amount!: string;

    @ApiProperty({ type: Number, description: 'Meses com reserva no ano' })
    public count!: number;
}

export class ReserveTotalsResponse {
    @ApiProperty({ ...MONEY_PROPERTY, description: 'Soma de todas as reservas já cadastradas ("0.00" se nenhuma)' })
    public total!: string;

    @ApiProperty({ type: Number, description: 'Meses com reserva, no total' })
    public count!: number;

    @ApiProperty({ type: () => [ReserveYearTotalDto], description: 'Soma por ano, só dos anos com reserva, em ordem crescente' })
    public byYear!: ReserveYearTotalDto[];
}
