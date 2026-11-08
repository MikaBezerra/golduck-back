import { HttpStatus } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';

export const CATEGORY_ERRORS = {
    notFound: (reason?: string): AppError =>
        new AppError('CATEGORY_NOT_FOUND', HttpStatus.NOT_FOUND, 'Categoria não encontrada', reason),
    nameConflict: (reason?: string): AppError =>
        new AppError('CATEGORY_NAME_CONFLICT', HttpStatus.CONFLICT, 'Já existe uma categoria com esse nome', reason),
    defaultProtected: (reason?: string): AppError =>
        new AppError('CATEGORY_DEFAULT_PROTECTED', HttpStatus.CONFLICT, 'A categoria padrão não pode ser alterada nem excluída', reason),
    /** Ninguém apaga a padrão pela API: só some se for apagada direto no banco. */
    defaultMissing: (reason?: string): AppError =>
        new AppError(
            'CATEGORY_DEFAULT_MISSING',
            HttpStatus.INTERNAL_SERVER_ERROR,
            'A categoria padrão ("Outros") não existe no banco. Marque uma categoria como padrão (isDefault) ou aplique a '
                + 'migração de categorias.',
            reason
        )
};
