import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DATE_TIME_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs';

const EMAIL_PROPERTY = { type: String, format: 'email', nullable: true, maxLength: 254 } as const;
const PHONE_PROPERTY = {
    type: String,
    nullable: true,
    example: '+5511999999999',
    description: 'Celular no formato internacional'
} as const;

export class CreatePersonDto {
    @ApiProperty({ type: String, maxLength: 120, example: 'Ayanne' })
    public name!: string;

    @ApiPropertyOptional(EMAIL_PROPERTY)
    public email?: string | null;

    @ApiPropertyOptional(PHONE_PROPERTY)
    public phone?: string | null;
}

export class ListPeopleDto {
    @ApiPropertyOptional({ type: Boolean, default: false, description: 'Inclui as pessoas inativas (ativas primeiro)' })
    public includeInactive!: boolean;
}

export class UpdatePersonDto {
    @ApiPropertyOptional({ type: String, maxLength: 120 })
    public name?: string;

    @ApiPropertyOptional(EMAIL_PROPERTY)
    public email?: string | null;

    @ApiPropertyOptional(PHONE_PROPERTY)
    public phone?: string | null;

    @ApiPropertyOptional({ type: Boolean })
    public active?: boolean;
}

export class PersonResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ type: String, format: 'email', nullable: true })
    public email!: string | null;

    @ApiProperty({ type: String, nullable: true })
    public phone!: string | null;

    @ApiProperty({ type: Boolean })
    public active!: boolean;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
