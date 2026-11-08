import Joi from 'joi';

import { CardBank } from '../../../generated/prisma/client.js';
import { JoiValidationPipePtbr } from '../../common/index.js';
import {
    CreateCreditCardDto,
    CreditCardBillsSummaryQueryDto,
    ListCreditCardBillsDto,
    UpdateCreditCardBillDto,
    UpdateCreditCardDto
} from '../dto/credit-card.dto.js';

const nameSchema = Joi.string().trim().min(1).max(120);
const daySchema = Joi.number().integer().min(1).max(31);
const idSchema = Joi.string().guid({ version: 'uuidv4' });
const amountSchema = Joi.string().pattern(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).max(20).messages({
    'string.pattern.base': 'O valor deve estar em reais, por exemplo 100.00'
});
const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});
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

export class CreateCreditCardPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateCreditCardDto>({
            name: nameSchema.required(),
            bank: Joi.string().valid(...Object.values(CardBank)).required(),
            dueDay: daySchema.optional(),
            bestPurchaseDay: daySchema.optional(),
            pluggyItemId: idSchema.optional(),
            syncFromMonth: monthSchema.optional(),
            creditLimit: amountSchema.optional()
        }).unknown(false);
    }
}

export class UpdateCreditCardPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateCreditCardDto>({
            name: nameSchema.optional(),
            active: Joi.boolean().optional(),
            dueDay: daySchema.optional(),
            bestPurchaseDay: daySchema.optional(),
            pluggyItemId: idSchema.allow(null).optional(),
            syncFromMonth: monthSchema.allow(null).optional(),
            creditLimit: amountSchema.allow(null).optional()
        }).min(1).unknown(false);
    }
}

export class CreditCardIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return idSchema.required().label('id');
    }
}

export class CreditCardBillMonthPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return monthSchema.required().label('month');
    }
}

export class ListCreditCardBillsPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListCreditCardBillsDto>({
            from: monthSchema.optional(),
            to: monthSchema.optional()
        }).unknown(false);
    }
}

export class UpdateCreditCardBillPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateCreditCardBillDto>({
            bestPurchaseDate: dateSchema.allow(null).required()
        }).unknown(false);
    }
}

export class CreditCardBillsSummaryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreditCardBillsSummaryQueryDto>({
            month: monthSchema.required()
        }).unknown(false);
    }
}
