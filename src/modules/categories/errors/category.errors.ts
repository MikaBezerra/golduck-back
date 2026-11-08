import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const CATEGORY_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CATEGORY_NOT_FOUND', HttpStatus.NOT_FOUND, 'Categoria não encontrada', reason),
    nameConflict: (reason?: string): AppError =>
        new AppError('CATEGORY_NAME_CONFLICT', HttpStatus.CONFLICT, 'Já existe uma categoria com esse nome', reason),
    defaultProtected: (reason?: string): AppError =>
        new AppError('CATEGORY_DEFAULT_PROTECTED', HttpStatus.CONFLICT, 'A categoria padrão não pode ser alterada', reason)
};
