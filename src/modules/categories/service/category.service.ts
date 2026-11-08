import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '../../../generated/prisma/client.js';

import { CategoryResponse, CreateCategoryDto, DeleteCategoryResponse, UpdateCategoryDto } from '../dto/category.dto.js';
import { CATEGORY_ERRORS } from '../errors/category.errors.js';
import { CategoryRepository } from '../repository/category.repository.js';

@Injectable()
export class CategoryService {
    public constructor(private readonly categoryRepository: CategoryRepository) { }

    public async create(data: CreateCategoryDto): Promise<CategoryResponse> {
        const name = this.normalizeName(data.name);
        const nameKey = this.makeNameKey(name);

        if (await this.categoryRepository.findByNameKey(nameKey)) {
            throw CATEGORY_ERRORS.nameConflict('category_name_already_exists');
        }

        try {
            return this.toResponse(await this.categoryRepository.create(name, nameKey));
        } catch (error: unknown) {
            this.rethrowNameConflict(error);
        }
    }

    public async findAll(includeInactive = false): Promise<CategoryResponse[]> {
        const categories = await this.categoryRepository.findAll(includeInactive);

        return categories.map(category => this.toResponse(category));
    }

    public async findById(id: string): Promise<CategoryResponse> {
        return this.toResponse(await this.getById(id));
    }

    public async findDefault(): Promise<Category> {
        const category = await this.categoryRepository.findDefault();

        if (!category) {
            throw CATEGORY_ERRORS.defaultMissing('default_category_missing');
        }

        return category;
    }

    public async update(id: string, data: UpdateCategoryDto): Promise<CategoryResponse> {
        const category = await this.getById(id);

        if (category.isDefault) {
            throw CATEGORY_ERRORS.defaultProtected('default_category_update');
        }

        const name = data.name === undefined ? undefined : this.normalizeName(data.name);
        const nameKey = name === undefined ? undefined : this.makeNameKey(name);

        if (nameKey && nameKey !== category.nameKey && await this.categoryRepository.findByNameKey(nameKey)) {
            throw CATEGORY_ERRORS.nameConflict('category_name_already_exists');
        }

        try {
            return this.toResponse(await this.categoryRepository.update(id, { name, nameKey, active: data.active }));
        } catch (error: unknown) {
            this.rethrowNameConflict(error);
        }
    }

    /** Exclui a categoria; as compras do cartão dela vão para a padrão ("Outros"), que não pode ser excluída. */
    public async delete(id: string): Promise<DeleteCategoryResponse> {
        const category = await this.getById(id);

        if (category.isDefault) {
            throw CATEGORY_ERRORS.defaultProtected('default_category_delete');
        }

        const target = await this.findDefault();
        const movedCardExpenses = await this.categoryRepository.deleteMovingCardExpenses(category.id, target.id);

        return {
            movedTo: this.toResponse(target),
            movedCardExpenses
        };
    }

    private async getById(id: string): Promise<Category> {
        const category = await this.categoryRepository.findById(id);

        if (!category) {
            throw CATEGORY_ERRORS.notFound('category_id_not_found');
        }

        return category;
    }

    private normalizeName(name: string): string {
        return name.trim().replace(/\s+/g, ' ');
    }

    private makeNameKey(name: string): string {
        return name.toLocaleLowerCase('pt-BR');
    }

    private toResponse(category: Category): CategoryResponse {
        return {
            id: category.id,
            name: category.name,
            active: category.active,
            isDefault: category.isDefault,
            createdAt: category.createdAt,
            updatedAt: category.updatedAt
        };
    }

    private rethrowNameConflict(error: unknown): never {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw CATEGORY_ERRORS.nameConflict('category_name_already_exists');
        }

        throw error;
    }
}
