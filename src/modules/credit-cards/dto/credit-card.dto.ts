import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CardBank } from '../../../generated/prisma/client.js';
import { DATE_TIME_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs.js';

const BANK_PROPERTY = {
    enum: CardBank,
    enumName: 'CardBank',
    description: 'Define o formato de fatura aceito: NUBANK e C6 em CSV, NEON em PDF'
};

export class CreateCreditCardDto {
    @ApiProperty({ type: String, maxLength: 120, example: 'Nubank Mikaell' })
    public name!: string;

    @ApiProperty(BANK_PROPERTY)
    public bank!: CardBank;
}

export class UpdateCreditCardDto {
    @ApiPropertyOptional({ type: String, maxLength: 120 })
    public name?: string;

    @ApiPropertyOptional({ type: Boolean })
    public active?: boolean;
}

export class CreditCardResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty(BANK_PROPERTY)
    public bank!: CardBank;

    @ApiProperty({ type: Boolean })
    public active!: boolean;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
