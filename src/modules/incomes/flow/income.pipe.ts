import * as Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common';
import { CreateIncomeDto, ListIncomeDto, UpdateIncomeDto } from '../dto/income.dto';

const yearSchema = Joi.number().integer().min(1000).max(9999);
const amountSchema = Joi.string().pattern(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).max(20).messages({
    'string.pattern.base': 'O valor deve estar em reais, por exemplo 10000.00'
});

export class CreateIncomePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateIncomeDto>({
            year: yearSchema.required(),
            months: Joi.array().items(Joi.number().integer().min(1).max(12)).min(1).max(12).unique().required(),
            amount: amountSchema.required()
        }).unknown(false);
    }
}

export class UpdateIncomePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateIncomeDto>({
            amount: amountSchema.required()
        }).unknown(false);
    }
}

export class ListIncomePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListIncomeDto>({
            year: yearSchema.optional()
        }).unknown(false);
    }
}

export class IncomeMonthPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).required().label('month').messages({
            'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
        });
    }
}
