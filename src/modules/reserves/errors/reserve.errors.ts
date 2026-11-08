import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const RESERVE_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('RESERVE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Reserva do mês não encontrada', reason),
    monthConflict: (reason?: string): AppError =>
        new AppError('RESERVE_MONTH_CONFLICT', HttpStatus.CONFLICT, 'Já existe reserva para um dos meses escolhidos', reason),
    invalidAmount: (reason?: string): AppError =>
        new AppError('RESERVE_INVALID_AMOUNT', HttpStatus.BAD_REQUEST, 'O valor da reserva deve ser maior que zero e caber em centavos', reason)
};
