import type { Category } from '../../../generated/prisma/client';

export class CreateCategoryDto {
    public name!: string;
}

export class ListCategoriesDto {
    public includeInactive!: boolean;
}

export class UpdateCategoryDto {
    public name?: string;

    public active?: boolean;
}

export type CategoryResponse = Omit<Category, 'nameKey'>;
