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

    @ApiProperty({ type: Boolean, description: 'Categoria padrão ("Outros"); não pode ser alterada nem excluída' })
    public isDefault!: boolean;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}

/** Resultado da exclusão: para onde foram as despesas da categoria. */
export class DeleteCategoryResponse {
    @ApiProperty({ type: () => CategoryResponse, description: 'Categoria que recebeu as despesas (a padrão)' })
    public movedTo!: CategoryResponse;

    @ApiProperty({ type: Number, description: 'Despesas fora do cartão que mudaram de categoria' })
    public movedManualExpenses!: number;

    @ApiProperty({ type: Number, description: 'Compras do cartão que mudaram de categoria (inclusive as excluídas)' })
    public movedCardExpenses!: number;
}
