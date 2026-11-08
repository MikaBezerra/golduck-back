import { Module } from '@nestjs/common';

import { CommonModule } from '../common/index.js';
import { CategoryController } from './controller/category.controller.js';
import { CategoryRepository } from './repository/category.repository.js';
import { CategoryService } from './service/category.service.js';

@Module({
    imports: [CommonModule],
    controllers: [CategoryController],
    providers: [CategoryRepository, CategoryService],
    exports: [CategoryService]
})
export class CategoriesModule { }
