import type { UploadedStatementFile } from '../service/card-import.service';
import type { FastifyRequest } from 'fastify';

import { CARD_IMPORT_ERRORS } from '../errors/card-import.errors';

export const MAX_STATEMENT_FILE_BYTES = 2 * 1024 * 1024;

const FILE_FIELD = 'file';
const MAX_FIELDS = 5;
const MAX_FIELD_BYTES = 200;

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
    let file: UploadedStatementFile | undefined;

    try {
        const parts = request.parts({
            limits: {
                files: 1,
                fields: MAX_FIELDS,
                fieldSize: MAX_FIELD_BYTES,
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
                fields[part.fieldname] = part.value;
            }
        }
    } catch (error: unknown) {
        throw toUploadError(error);
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
