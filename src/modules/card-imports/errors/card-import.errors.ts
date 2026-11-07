import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';

export const CARD_IMPORT_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CARD_IMPORT_NOT_FOUND', HttpStatus.NOT_FOUND, 'Upload de fatura não encontrado', reason),
    fileRequired: (reason?: string): AppError =>
        new AppError('IMPORT_FILE_REQUIRED', HttpStatus.BAD_REQUEST, 'Envie a fatura no campo file de um formulário multipart', reason),
    fileTooLarge: (reason?: string): AppError =>
        new AppError('IMPORT_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, 'O arquivo da fatura deve ter no máximo 2 MB', reason),
    invalidFileType: (reason?: string): AppError =>
        new AppError('IMPORT_INVALID_FILE_TYPE', HttpStatus.BAD_REQUEST, 'O tipo de arquivo não é aceito para o banco deste cartão', reason),
    invalidManualAmount: (reason?: string): AppError =>
        new AppError('IMPORT_INVALID_AMOUNT', HttpStatus.BAD_REQUEST, 'O valor de cada lançamento deve ser maior que zero e caber em centavos', reason),
    unsupportedFormat:(reason?: string): AppError =>
        new AppError(
            'IMPORT_UNSUPPORTED_FORMAT',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'O arquivo não corresponde ao banco do cartão escolhido ou o formato da fatura desse banco mudou e o sistema precisa ser atualizado',
            reason
        )
};
