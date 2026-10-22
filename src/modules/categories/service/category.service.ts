import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '../../../generated/prisma/client';

import { CategoryResponse, CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { CATEGORY_ERRORS } from '../errors/category.errors';
import { CategoryRepository } from '../repository/category.repository';

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

    public async findAll(): Promise<CategoryResponse[]> {
        const categories = await this.categoryRepository.findAll();

        return categories.map(category => this.toResponse(category));
    }

    public async findById(id: string): Promise<CategoryResponse> {
        return this.toResponse(await this.getById(id));
    }

    public async findDefault(): Promise<Category> {
        const category = await this.categoryRepository.findDefault();

        if (!category) {
            throw new Error('Categoria padrão não encontrada. Aplique a migração de categorias.');
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
