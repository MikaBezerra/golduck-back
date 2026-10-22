import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { CategoryResponse, CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { CategoryIdPipe, CreateCategoryPipe, UpdateCategoryPipe } from '../flow/category.pipe';
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
    public async findAll(): Promise<CategoryResponse[]> {
        return this.categoryService.findAll();
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
