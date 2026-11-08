import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const CARD_EXPENSE_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_NOT_FOUND', HttpStatus.NOT_FOUND, 'Despesa do cartão não encontrada', reason),
    inactiveCategory: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_INACTIVE_CATEGORY', HttpStatus.CONFLICT, 'A categoria selecionada está inativa', reason),
    inactivePerson: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_INACTIVE_PERSON', HttpStatus.CONFLICT, 'A pessoa selecionada está inativa', reason),
    moveNotAllowed: (reason?: string): AppError =>
        new AppError(
            'CARD_EXPENSE_MOVE_NOT_ALLOWED',
            HttpStatus.CONFLICT,
            'Compras de uma fatura enviada por arquivo não mudam de mês: envie a fatura do mês certo.',
            reason
        ),
    installmentInvalid: (reason?: string): AppError =>
        new AppError(
            'CARD_EXPENSE_INSTALLMENT_INVALID',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'A parcela não pode ser maior que o total de parcelas da compra.',
            reason
        )
};
