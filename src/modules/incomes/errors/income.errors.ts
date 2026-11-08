import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const INCOME_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('INCOME_NOT_FOUND', HttpStatus.NOT_FOUND, 'Entrada do mês não encontrada', reason),
    monthConflict: (reason?: string): AppError =>
        new AppError('INCOME_MONTH_CONFLICT', HttpStatus.CONFLICT, 'Já existe entrada para um dos meses escolhidos', reason),
    invalidAmount: (reason?: string): AppError =>
        new AppError('INCOME_INVALID_AMOUNT', HttpStatus.BAD_REQUEST, 'O valor da entrada deve ser maior que zero e caber em centavos', reason)
};
