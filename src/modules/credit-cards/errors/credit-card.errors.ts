import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const CREDIT_CARD_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CREDIT_CARD_NOT_FOUND', HttpStatus.NOT_FOUND, 'Cartão não encontrado', reason),
    inactive: (reason?: string): AppError =>
        new AppError('CREDIT_CARD_INACTIVE', HttpStatus.CONFLICT, 'O cartão selecionado está inativo', reason),
    billingNotConfigured: (reason?: string): AppError =>
        new AppError(
            'CREDIT_CARD_BILLING_NOT_CONFIGURED',
            HttpStatus.CONFLICT,
            'Informe o dia do vencimento e o melhor dia de compra do cartão.',
            reason
        ),
    billRangeInvalid: (reason?: string): AppError =>
        new AppError(
            'CREDIT_CARD_BILL_RANGE_INVALID',
            HttpStatus.BAD_REQUEST,
            'O período de faturas é inválido: "from" precisa vir antes de "to", com no máximo 24 faturas.',
            reason
        ),
    billDateOutOfRange: (reason?: string): AppError =>
        new AppError(
            'CREDIT_CARD_BILL_DATE_OUT_OF_RANGE',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'O melhor dia de compra precisa estar entre o início do mês anterior e o fim do mês da fatura.',
            reason
        ),
    billNotClosed: (reason?: string): AppError =>
        new AppError(
            'CREDIT_CARD_BILL_NOT_CLOSED',
            HttpStatus.CONFLICT,
            'A fatura ainda não fechou: só dá para marcar como paga depois do fechamento.',
            reason
        )
};
