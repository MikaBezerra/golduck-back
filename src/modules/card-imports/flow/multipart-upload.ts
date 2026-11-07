import type { ApiErrorDetail } from '../../common/http/response.types';
import type { UploadedStatementFile } from '../service/card-import.service';
import type { FastifyRequest } from 'fastify';

import { ValidationError } from '../../common/validation/validation-error';
import { CARD_IMPORT_ERRORS } from '../errors/card-import.errors';

export const MAX_STATEMENT_FILE_BYTES = 2 * 1024 * 1024;

const FILE_FIELD = 'file';
/** Campos JSON com as escolhas do usuário; só eles podem ser grandes. */
const LARGE_FIELDS = new Set(['overrides', 'exclusions']);
const MAX_FIELDS = 6;
/** Limite dos campos de texto comuns (cardId, month, password...). */
const MAX_FIELD_BYTES = 200;
const MAX_LARGE_FIELD_BYTES = 256 * 1024;

export type StatementUpload = {
    fields: Record<string, string>;
    file: UploadedStatementFile;
};

/**
 * Lê o formulário multipart inteiro, sem depender da ordem das partes:
 * o arquivo vem no campo "file" e os demais campos são textos.
 */
export async function readStatementUpload(request: FastifyRequest): Promise<StatementUpload> {
    if (!request.isMultipart()) {
        throw CARD_IMPORT_ERRORS.fileRequired('request_not_multipart');
    }

    const fields: Record<string, string> = {};
    const oversized: ApiErrorDetail[] = [];
    let file: UploadedStatementFile | undefined;

    try {
        const parts = request.parts({
            limits: {
                files: 1,
                fields: MAX_FIELDS,
                // O busboy aplica o mesmo limite a todos os campos; o limite menor dos
                // campos comuns é conferido abaixo, campo a campo.
                fieldSize: MAX_LARGE_FIELD_BYTES,
                fileSize: MAX_STATEMENT_FILE_BYTES
            }
        });

        for await (const part of parts) {
            if (part.type === 'file') {
                const content = await part.toBuffer();

                if (part.fieldname === FILE_FIELD) {
                    file = { fileName: part.filename, content };
                }
            } else if (typeof part.value === 'string') {
                const limit = LARGE_FIELDS.has(part.fieldname) ? MAX_LARGE_FIELD_BYTES : MAX_FIELD_BYTES;

                if (part.valueTruncated || Buffer.byteLength(part.value) > limit) {
                    oversized.push({
                        field: part.fieldname,
                        code: 'string.max',
                        message: `${part.fieldname} deve ter no máximo ${limit} bytes`
                    });
                } else {
                    fields[part.fieldname] = part.value;
                }
            }
        }
    } catch (error: unknown) {
        throw toUploadError(error);
    }

    if (oversized.length > 0) {
        throw new ValidationError(oversized);
    }

    if (!file || file.content.length === 0) {
        throw CARD_IMPORT_ERRORS.fileRequired('file_part_missing');
    }

    return { fields, file };
}

function toUploadError(error: unknown): unknown {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

    switch (code) {
        case 'FST_REQ_FILE_TOO_LARGE':
            return CARD_IMPORT_ERRORS.fileTooLarge('file_size_limit');
        case 'FST_FILES_LIMIT':
        case 'FST_FIELDS_LIMIT':
        case 'FST_PARTS_LIMIT':
            return CARD_IMPORT_ERRORS.fileRequired('multipart_limit_exceeded');
        case 'FST_INVALID_MULTIPART_CONTENT_TYPE':
            return CARD_IMPORT_ERRORS.fileRequired('request_not_multipart');
        default:
            return error;
    }
}
