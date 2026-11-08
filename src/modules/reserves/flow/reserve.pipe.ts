import Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common/index.js';
import { CreateReserveDto, ListReserveDto, UpdateReserveDto } from '../dto/reserve.dto.js';

const yearSchema = Joi.number().integer().min(1000).max(9999);
const amountSchema = Joi.string().pattern(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).max(20).messages({
    'string.pattern.base': 'O valor deve estar em reais, por exemplo 10000.00'
});

export class CreateReservePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateReserveDto>({
            year: yearSchema.required(),
            months: Joi.array().items(Joi.number().integer().min(1).max(12)).min(1).max(12).unique().required(),
            amount: amountSchema.required()
        }).unknown(false);
    }
}

export class UpdateReservePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateReserveDto>({
            amount: amountSchema.required()
        }).unknown(false);
    }
}

export class ListReservePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListReserveDto>({
            year: yearSchema.optional()
        }).unknown(false);
    }
}

export class ReserveMonthPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).required().label('month').messages({
            'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
        });
    }
}
