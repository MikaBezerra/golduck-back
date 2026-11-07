import * as Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common';
import { CreatePersonDto, ListPeopleDto, UpdatePersonDto } from '../dto/person.dto';

const nameSchema = Joi.string().trim().min(1).max(120);
const emailSchema = Joi.string().trim().lowercase().email().max(254).allow(null);
const phoneSchema = Joi.string().trim().pattern(/^\+[1-9]\d{1,14}$/).allow(null).messages({
    'string.pattern.base': 'O celular deve estar no formato internacional, por exemplo +5511999999999'
});

export class CreatePersonPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreatePersonDto>({
            name: nameSchema.required(),
            email: emailSchema.optional(),
            phone: phoneSchema.optional()
        }).unknown(false);
    }
}

export class UpdatePersonPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<UpdatePersonDto>({
            name: nameSchema.optional(),
            email: emailSchema.optional(),
            phone: phoneSchema.optional(),
            active: Joi.boolean().optional()
        }).min(1).unknown(false);
    }
}

export class ListPeoplePipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<ListPeopleDto>({
            includeInactive: Joi.boolean().default(false)
        }).unknown(false);
    }
}

export class PersonIdPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.string().guid({ version: 'uuidv4' }).required().label('id');
    }
}
