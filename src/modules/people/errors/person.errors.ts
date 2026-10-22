import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';

export const PERSON_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('PERSON_NOT_FOUND', HttpStatus.NOT_FOUND, 'Pessoa não encontrada', reason)
};
