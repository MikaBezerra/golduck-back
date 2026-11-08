import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

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
    overrideUnknownKey: (reason?: string): AppError =>
        new AppError('IMPORT_OVERRIDE_UNKNOWN_KEY', HttpStatus.BAD_REQUEST, 'A fatura mudou desde a pré-visualização; pré-visualize de novo', reason),
    // Mesmos códigos das despesas do cartão, para o front tratar os dois casos igual.
    inactiveCategory: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_INACTIVE_CATEGORY', HttpStatus.CONFLICT, 'A categoria selecionada está inativa', reason),
    inactivePerson: (reason?: string): AppError =>
        new AppError('CARD_EXPENSE_INACTIVE_PERSON', HttpStatus.CONFLICT, 'A pessoa selecionada está inativa', reason),
    passwordInvalid:(reason?: string): AppError =>
        new AppError('IMPORT_FILE_PASSWORD_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, 'O arquivo é protegido: informe a senha correta no campo password', reason),
    unsupportedFormat: (reason?: string): AppError =>
        new AppError(
            'IMPORT_UNSUPPORTED_FORMAT',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'O arquivo não corresponde ao banco do cartão escolhido ou o formato da fatura desse banco mudou e o sistema precisa ser atualizado',
            reason
        )
};
