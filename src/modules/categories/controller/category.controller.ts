import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import { CategoryResponse, CreateCategoryDto, DeleteCategoryResponse, ListCategoriesDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { CategoryIdPipe, CreateCategoryPipe, ListCategoriesPipe, UpdateCategoryPipe } from '../flow/category.pipe.js';
import { CategoryService } from '../service/category.service.js';

@ApiTags('categories')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('categories')
@Roles(Role.USER)
export class CategoryController {
    public constructor(private readonly categoryService: CategoryService) { }

    @Post()
    @ApiOperation({ summary: 'Cadastra uma categoria' })
    @ApiDataResponse(CategoryResponse, { status: HttpStatus.CREATED })
    public async create(@Body(CreateCategoryPipe) body: CreateCategoryDto): Promise<CategoryResponse> {
        return this.categoryService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Lista as categorias (só as ativas, salvo includeInactive=true)' })
    @ApiDataResponse(CategoryResponse, { isArray: true })
    public async findAll(
        @Query(ListCategoriesPipe) query: ListCategoriesDto
    ): Promise<CategoryResponse[]> {
        return this.categoryService.findAll(query.includeInactive);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Consulta uma categoria' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CategoryResponse)
    public async findById(@Param('id', CategoryIdPipe) id: string): Promise<CategoryResponse> {
        return this.categoryService.findById(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Altera nome ou estado ativo (a categoria padrão é protegida)' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CategoryResponse)
    public async update(
        @Param('id', CategoryIdPipe) id: string,
        @Body(UpdateCategoryPipe) body: UpdateCategoryDto
    ): Promise<CategoryResponse> {
        return this.categoryService.update(id, body);
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Exclui a categoria e passa as compras do cartão dela para a padrão',
        description: 'As compras do cartão (inclusive as excluídas) vão para "Outros". '
            + 'A categoria padrão não pode ser excluída (409 CATEGORY_DEFAULT_PROTECTED).'
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(DeleteCategoryResponse)
    public async delete(@Param('id', CategoryIdPipe) id: string): Promise<DeleteCategoryResponse> {
        return this.categoryService.delete(id);
    }
}
