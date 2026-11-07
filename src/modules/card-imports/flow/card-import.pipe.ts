import * as Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common';
import {
    CreateCardImportDto,
    CreateManualCardImportDto,
    ListCardImportsDto,
    ManualCardTransactionDto
} from '../dto/card-import.dto';
import { toIsoDate } from '../parsers/card-statement.parser';

const MAX_MANUAL_TRANSACTIONS = 500;
const MAX_INSTALLMENTS = 99;

const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});
const idSchema = Joi.string().guid({ version: 'uuidv4' });
const dateSchema = Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value: string, helpers) => {
        const [year, month, day] = value.split('-').map(Number);

        return toIsoDate(year, month, day) === value ? value : helpers.error('any.invalid');
    })
    .messages({
        'string.pattern.base': 'A data deve estar no formato AAAA-MM-DD',
        'any.invalid': 'A data informada não existe'
    });
const amountSchema = Joi.string().pattern(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).max(20).messages({
    'string.pattern.base': 'O valor deve estar em reais, por exemplo 100.00'
});
const installmentNumberSchema = Joi.number().integer().min(1).max(MAX_INSTALLMENTS);

/** Valida os campos de texto enviados junto com o arquivo no multipart. */
export class CreateCardImportPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateCardImportDto>({
            cardId: idSchema.required(),
            month: monthSchema.required(),
            password: Joi.string().min(1).max(100).optional()
        }).unknown(false);
    }
}

export class CreateManualCardImportPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateManualCardImportDto>({
            cardId: idSchema.required(),
            month: monthSchema.required(),
            transactions: Joi.array().items(
                Joi.object<ManualCardTransactionDto>({
                    date: dateSchema.required(),
                    description: Joi.string().trim().min(1).max(200).required(),
                    amount: amountSchema.required(),
                    installment: Joi.object({
                        number: installmentNumberSchema.max(Joi.ref('total')).required().messages({
                            'number.max': 'A parcela não pode ser maior que o total de parcelas'
                        }),
                        total: installmentNumberSchema.required()
                    }).allow(null).optional(),
                    cardLastDigits: Joi.string().pattern(/^\d{4}$/).allow(null).optional().messages({
                        'string.pattern.base': 'O final do cartão deve ter 4 dígitos'
                    })
                }).unknown(false)
            ).max(MAX_MANUAL_TRANSACTIONS).required()
        }).unknown(false);
    }
}

export class ListCardImportsPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListCardImportsDto>({
            cardId: idSchema.optional(),
            month: monthSchema.optional()
        }).unknown(false);
    }
}

export class CardImportIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return idSchema.required().label('id');
    }
}
