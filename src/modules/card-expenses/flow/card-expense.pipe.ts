import Joi from 'joi';

import { ALL_SPLITS, splitSchemas } from '../../common/expense-split/expense-split.js';
import { JoiValidationPipePtbr } from '../../common/index.js';
import {
    CardExpenseChangesDto,
    CardExpenseScopeDto,
    CreateCardExpenseDto,
    ListCardExpensesDto,
    MoveCardExpenseDto,
    UpdateCardExpensesDto
} from '../dto/card-expense.dto.js';
import { CARD_EXPENSE_SCOPES } from '../service/card-expense-scope.js';

const MAX_INSTALLMENTS = 99;

const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});
const idSchema = Joi.string().guid({ version: 'uuidv4' });
const dateSchema = Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value: string, helpers) => {
        const date = new Date(`${value}T00:00:00.000Z`);

        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : helpers.error('any.invalid');
    })
    .messages({
        'string.pattern.base': 'A data deve estar no formato AAAA-MM-DD',
        'any.invalid': 'A data informada não existe'
    });
const amountSchema = Joi.string().pattern(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).max(20).messages({
    'string.pattern.base': 'O valor deve estar em reais, por exemplo 100.00'
});
const installmentSchema = Joi.number().integer().min(1).max(MAX_INSTALLMENTS);

export class ListCardExpensesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListCardExpensesDto>({
            month: monthSchema.required(),
            cardId: idSchema.optional(),
            includeExcluded: Joi.boolean().default(false),
            split: Joi.string().valid(...ALL_SPLITS).optional()
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
                ...splitSchemas(idSchema, { required: false })
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

export class CreateCardExpensePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateCardExpenseDto>({
            cardId: idSchema.required(),
            month: monthSchema.required(),
            date: dateSchema.required(),
            description: Joi.string().trim().min(1).max(200).required(),
            amount: amountSchema.required(),
            installment: Joi.object({
                number: installmentSchema.max(Joi.ref('total')).required().messages({
                    'number.max': 'A parcela não pode ser maior que o total de parcelas'
                }),
                total: installmentSchema.required()
            }).allow(null).optional(),
            nickname: Joi.string().trim().min(1).max(160).allow(null).optional(),
            categoryId: idSchema.optional(),
            ...splitSchemas(idSchema, { required: true })
        }).unknown(false);
    }
}

export class MoveCardExpensePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<MoveCardExpenseDto>({
            month: monthSchema.required(),
            installmentNumber: installmentSchema.optional(),
            installmentTotal: installmentSchema.optional()
        }).unknown(false);
    }
}

export class CardExpenseIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return idSchema.required().label('id');
    }
}
