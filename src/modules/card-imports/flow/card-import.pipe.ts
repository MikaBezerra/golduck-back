import Joi from 'joi';

import { CARD_EXPENSE_SCOPES } from '../../card-expenses/service/card-expense-scope.js';
import { JoiValidationPipePtbr } from '../../common/index.js';
import { ValidationError } from '../../common/validation/validation-error.js';
import {
    CardImportExclusionDto,
    CardImportOverrideDto,
    CreateCardImportDto,
    ListCardImportsDto
} from '../dto/card-import.dto.js';

const MAX_CHOICES = 500;

const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});
const idSchema = Joi.string().guid({ version: 'uuidv4' });

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
            ).max(MAX_CHOICES).unique('key').required()
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
            ).max(MAX_CHOICES).unique('key').required()
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
