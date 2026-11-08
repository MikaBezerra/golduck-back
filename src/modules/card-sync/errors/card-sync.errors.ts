import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const CARD_SYNC_ERRORS = {
    notConfigured: (reason?: string): AppError =>
        new AppError(
            'CARD_SYNC_NOT_CONFIGURED',
            HttpStatus.CONFLICT,
            'Para sincronizar, informe no cartão o item do Meu Pluggy, o dia do vencimento, o melhor dia de compra e a '
                + 'primeira fatura a sincronizar.',
            reason
        ),
    noCreditAccount: (reason?: string): AppError =>
        new AppError(
            'CARD_SYNC_NO_CREDIT_ACCOUNT',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'O item do Meu Pluggy informado não tem cartão de crédito. Confira o id do item no cartão.',
            reason
        ),
    itemNotFound: (reason?: string): AppError =>
        new AppError(
            'CARD_SYNC_ITEM_NOT_FOUND',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'O item do Meu Pluggy informado não foi encontrado. Confira o id do item no cartão.',
            reason
        ),
    pluggyDisabled: (reason?: string): AppError =>
        new AppError('PLUGGY_DISABLED', HttpStatus.SERVICE_UNAVAILABLE, 'A sincronização com o Meu Pluggy está desligada neste ambiente.', reason),
    pluggyAuthFailed: (reason?: string): AppError =>
        new AppError(
            'PLUGGY_AUTH_FAILED',
            HttpStatus.BAD_GATEWAY,
            'A Pluggy recusou as credenciais da aplicação (Client ID e Client Secret). Confira as variáveis PLUGGY_*.',
            reason
        ),
    pluggyUnavailable: (reason?: string): AppError =>
        new AppError(
            'PLUGGY_UNAVAILABLE',
            HttpStatus.BAD_GATEWAY,
            'A Pluggy não respondeu como esperado. Nada foi alterado; tente de novo em alguns minutos.',
            reason
        ),
    unexpected: (reason?: string): AppError =>
        new AppError(
            'CARD_SYNC_FAILED',
            HttpStatus.INTERNAL_SERVER_ERROR,
            'Erro inesperado ao sincronizar o cartão. As compras não foram alteradas; se continuar, procure o erro nos logs da API.',
            reason
        ),
    cronUnauthorized: (reason?: string): AppError =>
        new AppError('CRON_UNAUTHORIZED', HttpStatus.UNAUTHORIZED, 'Chamada da rotina agendada sem a chave correta.', reason)
};
