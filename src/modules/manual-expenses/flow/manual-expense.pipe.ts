import Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common/index.js';
import {
    CreateManualExpenseDto,
    DeleteManualExpensesDto,
    ListManualExpensesDto,
    ManualExpenseChangesDto,
    UpdateManualExpensesDto
} from '../dto/manual-expense.dto.js';

const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});
const titleSchema = Joi.string().trim().min(1).max(160);
const amountSchema = Joi.string().pattern(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).max(20).messages({
    'string.pattern.base': 'O valor deve estar em reais, por exemplo 100.00'
});
const idSchema = Joi.string().guid({ version: 'uuidv4' });
const idsSchema = Joi.array().items(idSchema.required()).min(1).unique().required();

export class CreateManualExpensePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateManualExpenseDto>({
            month: monthSchema.required(),
            title: titleSchema.required(),
            amount: amountSchema.required(),
            categoryId: idSchema.optional(),
            personId: idSchema.allow(null).optional(),
            replicateUntilYearEnd: Joi.boolean().optional()
        }).unknown(false);
    }
}

export class UpdateManualExpensesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateManualExpensesDto>({
            ids: idsSchema,
            changes: Joi.object<ManualExpenseChangesDto>({
                title: titleSchema.optional(),
                amount: amountSchema.optional(),
                categoryId: idSchema.optional(),
                personId: idSchema.allow(null).optional()
            }).min(1).unknown(false).required()
        }).unknown(false);
    }
}

export class DeleteManualExpensesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<DeleteManualExpensesDto>({
            ids: idsSchema
        }).unknown(false);
    }
}

export class ListManualExpensesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListManualExpensesDto>({
            month: monthSchema.required()
        }).unknown(false);
    }
}

export class ManualExpenseIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return idSchema.required().label('id');
    }
}
