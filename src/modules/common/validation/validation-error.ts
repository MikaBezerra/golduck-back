import type { ApiErrorDetail } from '../http/response.types.js';
import { HttpStatus } from '@nestjs/common';

import { AppError } from '../errors/app-error.js';

export class ValidationError extends AppError {
    public constructor(public readonly details: ApiErrorDetail[]) {
        super('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, 'Os dados enviados são inválidos');
    }
}
