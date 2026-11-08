import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const CARD_EXPENSE_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Despesa do cartão não encontrada', reason),
    inactiveCategory: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_INACTIVE_CATEGORY', HttpStatus.CONFLICT, 'A categoria selecionada está inativa', reason),
    inactivePerson: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_INACTIVE_PERSON', HttpStatus.CONFLICT, 'A pessoa selecionada está inativa', reason)
};
