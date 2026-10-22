import type { ApiErrorDetail } from '../http/response.types';
import { Injectable, PipeTransform } from '@nestjs/common';
import * as Joi from 'joi';

import { JOI_MESSAGES_PTBR } from './joi-messages.ptbr';
import { ValidationError } from './validation-error';

@Injectable()
export abstract class JoiValidationPipePtbr implements PipeTransform<unknown> {
    public transform(value: unknown): unknown {
        const result = this.buildSchema().validate(value, {
            abortEarly: false,
            messages: JOI_MESSAGES_PTBR,
            errors: { wrap: { label: false } }
        });

        if (result.error) {
            const details: ApiErrorDetail[] = result.error.details.map(detail => ({
                field: this.formatPath(detail.path),
                code: detail.type,
                message: detail.message
            }));

            throw new ValidationError(details);
        }

        return result.value;
    }

    private formatPath(path: Array<string | number>): string {
        if (path.length === 0) {
            return '$';
        }

        return path.reduce<string>((result, part) => {
            if (typeof part === 'number') {
                return `${result}[${part}]`;
            }

            return result ? `${result}.${part}` : part;
        }, '');
    }

    public abstract buildSchema(): Joi.Schema;
}
