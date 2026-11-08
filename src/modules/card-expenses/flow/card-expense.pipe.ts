import Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common/index.js';
import { CardExpenseChangesDto, CardExpenseScopeDto, ListCardExpensesDto, UpdateCardExpensesDto } from '../dto/card-expense.dto.js';
import { CARD_EXPENSE_SCOPES } from '../service/card-expense-scope.js';

const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});
const idSchema = Joi.string().guid({ version: 'uuidv4' });

export class ListCardExpensesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListCardExpensesDto>({
            month: monthSchema.required(),
            cardId: idSchema.optional(),
            includeExcluded: Joi.boolean().default(false)
        }).unknown(false);
    }
}

export class UpdateCardExpensesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateCardExpensesDto>({
            ids: Joi.array().items(idSchema.required()).min(1).unique().required(),
            changes: Joi.object<CardExpenseChangesDto>({
                nickname: Joi.string().trim().min(1).max(160).allow(null).optional(),
                categoryId: idSchema.optional(),
                personId: idSchema.allow(null).optional()
            }).min(1).unknown(false).required()
        }).unknown(false);
    }
}

export class CardExpenseScopePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CardExpenseScopeDto>({
            ids: Joi.array().items(idSchema.required()).min(1).unique().required(),
            scope: Joi.string().valid(...CARD_EXPENSE_SCOPES).required()
        }).unknown(false);
    }
}

export class CardExpenseIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return idSchema.required().label('id');
    }
}
