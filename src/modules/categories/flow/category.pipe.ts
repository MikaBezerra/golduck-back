import * as Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common';
import { CreateCategoryDto, ListCategoriesDto, UpdateCategoryDto } from '../dto/category.dto';

const nameSchema = Joi.string().trim().min(1).max(120);

export class CreateCategoryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateCategoryDto>({
            name: nameSchema.required()
        }).unknown(false);
    }
}

export class UpdateCategoryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateCategoryDto>({
            name: nameSchema.optional(),
            active: Joi.boolean().optional()
        }).min(1).unknown(false);
    }
}

export class ListCategoriesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListCategoriesDto>({
            includeInactive: Joi.boolean().default(false)
        }).unknown(false);
    }
}

export class CategoryIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.string().guid({ version: 'uuidv4' }).required().label('id');
    }
}
