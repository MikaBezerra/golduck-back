import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const SUMMARY_DISPATCH_ERRORS = {
    inProgress: (reason?: string): AppError =>
        new AppError(
            'SUMMARY_DISPATCH_IN_PROGRESS',
            HttpStatus.CONFLICT,
            'Já existe um envio deste mês em andamento. Aguarde alguns segundos e confira o resultado.',
            reason
        ),
    keyReused: (reason?: string): AppError =>
        new AppError(
            'SUMMARY_DISPATCH_KEY_REUSED',
            HttpStatus.CONFLICT,
            'Esta Idempotency-Key já foi usada em um envio de outro mês. Gere uma chave nova para cada envio.',
            reason
        ),
    unknownPerson: (reason?: string): AppError =>
        new AppError(
            'SUMMARY_DISPATCH_UNKNOWN_PERSON',
            HttpStatus.BAD_REQUEST,
            'Só é possível enviar o resumo para pessoas ativas que participam da divisão do mês.',
            reason
        ),
    mailDisabled: (reason?: string): AppError =>
        new AppError('MAIL_DISABLED', HttpStatus.SERVICE_UNAVAILABLE, 'O envio de e-mail está desligado neste ambiente.', reason),
    mailUnavailable: (reason?: string): AppError =>
        new AppError(
            'MAIL_UNAVAILABLE',
            HttpStatus.SERVICE_UNAVAILABLE,
            'O serviço de e-mail não respondeu. Ninguém recebeu o resumo; tente de novo em alguns minutos.',
            reason
        )
};
