import Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common/index.js';
import { LoginDto } from '../dto/auth.dto.js';

export class LoginPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<LoginDto>({
            email: Joi.string().trim().lowercase().email().max(254).required(),
            password: Joi.string().min(1).max(1024).required()
        }).unknown(false);
    }
}
