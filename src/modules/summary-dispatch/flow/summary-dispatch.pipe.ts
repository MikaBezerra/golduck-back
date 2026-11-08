import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import Joi from 'joi';

import { JoiValidationPipePtbr } from '../../common/index.js';
import { CreateSummaryDispatchDto, SummaryDispatchMonthDto, SummaryEmailQueryDto } from '../dto/summary-dispatch.dto.js';

const monthSchema = Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).messages({
    'string.pattern.base': 'O mês deve estar no formato AAAA-MM'
});

export class SummaryDispatchMonthPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<SummaryDispatchMonthDto>({
            month: monthSchema.required()
        }).unknown(false);
    }
}

export class CreateSummaryDispatchPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<CreateSummaryDispatchDto>({
            month: monthSchema.required(),
            personIds: Joi.array().items(Joi.string().uuid()).min(1).max(50).unique().optional()
        }).unknown(false);
    }
}

export class SummaryEmailQueryPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.object<SummaryEmailQueryDto>({
            month: monthSchema.required(),
            personId: Joi.string().uuid().required()
        }).unknown(false);
    }
}

/** Header Idempotency-Key: um UUID gerado pelo front a cada intenção de envio. */
export class IdempotencyKeyPipe extends JoiValidationPipePtbr {
    public buildSchema(): Joi.Schema {
        return Joi.string().uuid().required().label('Idempotency-Key').messages({
            'any.required': 'O header Idempotency-Key é obrigatório',
            'string.guid': 'O header Idempotency-Key deve ser um UUID'
        });
    }
}

const idempotencyKeyParam = createParamDecorator(
    (_data: unknown, context: ExecutionContext): unknown => context.switchToHttp().getRequest<FastifyRequest>().headers['idempotency-key']
);

/** Lê o header Idempotency-Key e valida com o IdempotencyKeyPipe (UUID obrigatório). */
export function IdempotencyKey(): ParameterDecorator {
    return idempotencyKeyParam(IdempotencyKeyPipe);
}
