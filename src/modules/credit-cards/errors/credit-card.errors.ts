import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';

export const CREDIT_CARD_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CREDIT_CARD_NOT_FOUND', HttpStatus.NOT_FOUND, 'Cartão não encontrado', reason),
    inactive: (reason?: string): AppError =>
        new AppError('CREDIT_CARD_INACTIVE', HttpStatus.CONFLICT, 'O cartão selecionado está inativo', reason)
};
