import Joi from 'joi';

import { CARD_EXPENSE_SCOPES } from '../../card-expenses/service/card-expense-scope.js';
import { JoiValidationPipePtbr } from '../../common/index.js';
import { ValidationError } from '../../common/validation/validation-error.js';
import {
    CardImportExclusionDto,
    CardImportOverrideDto,
    CreateCardImportDto,
    CreateManualCardImportDto,
    ListCardImportsDto,
    ManualCardTransactionDto
} from '../dto/card-import.dto.js';
import { toIsoDate } from '../parsers/card-statement.parser.js';

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
            password: Joi.string().min(1).max(100).optional(),
            // Textos JSON; o conteúdo é validado por CardImportOverridesPipe e CardImportExclusionsPipe.
            overrides: Joi.string().optional(),
            exclusions: Joi.string().optional()
        }).unknown(false);
    }
}

/** Converte o campo overrides (texto JSON) na lista de escolhas e valida cada item. */
export class CardImportOverridesPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object({
            overrides: Joi.array().items(
                Joi.object<CardImportOverrideDto>({
                    key: Joi.string().min(1).max(400).required(),
                    nickname: Joi.string().trim().min(1).max(160).allow(null).required(),
                    categoryId: idSchema.required(),
                    personId: idSchema.allow(null).required()
                }).unknown(false)
            ).max(MAX_MANUAL_TRANSACTIONS).unique('key').required()
        });
    }

    public override transform(value: unknown): CardImportOverrideDto[] {
        return (super.transform({ overrides: parseJsonField(value, 'overrides') }) as { overrides: CardImportOverrideDto[] }).overrides;
    }
}

/** Converte o campo exclusions (texto JSON) nas decisões de excluir/restaurar e valida cada item. */
export class CardImportExclusionsPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object({
            exclusions: Joi.array().items(
                Joi.object<CardImportExclusionDto>({
                    key: Joi.string().min(1).max(400).required(),
                    action: Joi.string().valid('exclude', 'restore').required(),
                    scope: Joi.string().valid(...CARD_EXPENSE_SCOPES).required(),
                    remember: Joi.boolean().default(false)
                }).unknown(false)
            ).max(MAX_MANUAL_TRANSACTIONS).unique('key').required()
        });
    }

    public override transform(value: unknown): CardImportExclusionDto[] {
        return (super.transform({ exclusions: parseJsonField(value, 'exclusions') }) as { exclusions: CardImportExclusionDto[] }).exclusions;
    }
}

function parseJsonField(value: unknown, field: string): unknown {
    try {
        return JSON.parse(String(value));
    } catch {
        throw new ValidationError([{ field, code: 'json.invalid', message: `${field} deve conter um JSON válido` }]);
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
