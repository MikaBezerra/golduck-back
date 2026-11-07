import * as Joi from 'joi';

import { CardBank } from '../../../generated/prisma/client';
import { JoiValidationPipePtbr } from '../../common';
import { CreateCreditCardDto, UpdateCreditCardDto } from '../dto/credit-card.dto';

const nameSchema = Joi.string().trim().min(1).max(120);

export class CreateCreditCardPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateCreditCardDto>({
            name: nameSchema.required(),
            bank: Joi.string().valid(...Object.values(CardBank)).required()
        }).unknown(false);
    }
}

export class UpdateCreditCardPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdateCreditCardDto>({
            name: nameSchema.optional(),
            active: Joi.boolean().optional()
        }).min(1).unknown(false);
    }
}

export class CreditCardIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.string().guid({ version: 'uuidv4' }).required().label('id');
    }
}
