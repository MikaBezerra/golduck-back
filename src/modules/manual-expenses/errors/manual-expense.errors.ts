import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const MANUAL_EXPENSE_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('MANUAL_EXPENSE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Despesa não encontrada', reason),
    invalidAmount: (reason?: string): AppError =>
        new AppError('MANUAL_EXPENSE_INVALID_AMOUNT', HttpStatus.BAD_REQUEST, 'O valor da despesa deve ser maior que zero e caber em centavos', reason),
    inactiveCategory: (reason?: string): AppError =>
        new AppError('MANUAL_EXPENSE_INACTIVE_CATEGORY', HttpStatus.CONFLICT, 'A categoria selecionada está inativa', reason),
    inactivePerson: (reason?: string): AppError =>
        new AppError('MANUAL_EXPENSE_INACTIVE_PERSON', HttpStatus.CONFLICT, 'A pessoa selecionada está inativa', reason)
};
