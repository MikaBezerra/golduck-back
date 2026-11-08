import Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common/index.js';
import { AnnualSummaryQueryDto, SummaryQueryDto } from '../dto/summary.dto.js';

export class SummaryQueryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<SummaryQueryDto>({
            month: Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).required().messages({
                'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
            })
        }).unknown(false);
    }
}

export class AnnualSummaryQueryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<AnnualSummaryQueryDto>({
            year: Joi.number().integer().min(2000).max(2100).required()
        }).unknown(false);
    }
}
