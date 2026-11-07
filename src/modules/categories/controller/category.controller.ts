import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { CategoryResponse, CreateCategoryDto, ListCategoriesDto, UpdateCategoryDto } from '../dto/category.dto';
import { CategoryIdPipe, CreateCategoryPipe, ListCategoriesPipe, UpdateCategoryPipe } from '../flow/category.pipe';
import { CategoryService } from '../service/category.service';

@Controller('categories')
@Roles(Role.USER)
export class CategoryController {
    public constructor(private readonly categoryService: CategoryService) { }

    @Post()
    public async create(@Body(CreateCategoryPipe) body: CreateCategoryDto): Promise<CategoryResponse> {
        return this.categoryService.create(body);
    }

    @Get()
    public async findAll(
        @Query(ListCategoriesPipe) query: ListCategoriesDto
    ): Promise<CategoryResponse[]> {
        return this.categoryService.findAll(query.includeInactive);
    }

    @Get(':id')
    public async findById(@Param('id', CategoryIdPipe) id: string): Promise<CategoryResponse> {
        return this.categoryService.findById(id);
    }

    @Patch(':id')
    public async update(
        @Param('id', CategoryIdPipe) id: string,
        @Body(UpdateCategoryPipe) body: UpdateCategoryDto
    ): Promise<CategoryResponse> {
        return this.categoryService.update(id, body);
    }
}
