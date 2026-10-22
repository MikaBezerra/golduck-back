import * as Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common';
import { LoginDto, RefreshDto } from '../dto/auth.dto';

export class LoginPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<LoginDto>({
            email: Joi.string().trim().lowercase().email().max(254).required(),
            password: Joi.string().min(1).max(1024).required()
        }).unknown(false);
    }
}

export class RefreshPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<RefreshDto>({
            refreshToken: Joi.string().max(256).required()
        }).unknown(false);
    }
}
