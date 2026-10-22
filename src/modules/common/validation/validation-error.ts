import type { ApiErrorDetail } from '../http/response.types';
import { HttpStatus } from '@nestjs/common';

import { AppError } from '../errors/app-error';

export class ValidationError extends AppError {
    public constructor(public readonly details: ApiErrorDetail[]) {
        super('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, 'Os dados enviados são inválidos');
    }
}
