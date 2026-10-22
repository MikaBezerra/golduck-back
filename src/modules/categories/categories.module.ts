import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { CategoryController } from './controller/category.controller';
import { CategoryRepository } from './repository/category.repository';
import { CategoryService } from './service/category.service';

@Module({
    imports: [CommonModule],
    controllers: [CategoryController],
    providers: [CategoryRepository, CategoryService],
    exports: [CategoryService]
})
export class CategoriesModule { }
