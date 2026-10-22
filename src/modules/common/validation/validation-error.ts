import { HttpStatus } from '@nestjs/common';

import { AppError } from '../errors/app-error';
import type { ApiErrorDetail } from '../http/response.types';

export class ValidationError extends AppError {
    public constructor(public readonly details: ApiErrorDetail[]) {
        super('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, 'Os dados enviados são inválidos');
    }
}
