import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DATE_TIME_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs.js';

export class CreateCategoryDto {
    @ApiProperty({ type: String, maxLength: 120, example: 'Moradia' })
    public name!: string;
}

export class ListCategoriesDto {
    @ApiPropertyOptional({ type: Boolean, default: false, description: 'Inclui as categorias inativas (ativas primeiro)' })
    public includeInactive!: boolean;
}

export class UpdateCategoryDto {
    @ApiPropertyOptional({ type: String, maxLength: 120 })
    public name?: string;

    @ApiPropertyOptional({ type: Boolean })
    public active?: boolean;
}

export class CategoryResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ type: Boolean })
    public active!: boolean;

    @ApiProperty({ type: Boolean, description: 'Categoria padrão ("Outros"); não pode ser alterada' })
    public isDefault!: boolean;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
