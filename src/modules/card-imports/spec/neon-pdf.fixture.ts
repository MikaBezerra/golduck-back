import { createHash } from 'node:crypto';

/*
 * Gera, no próprio teste, PDFs no formato da fatura do Neon: cada linha da tabela vira uma linha
 * de texto do PDF e cada célula um trecho separado (como o pdf.js entrega a fatura real). Não há
 * fatura real no repositório (teria dados pessoais), então o arquivo é montado à mão: PDF 1.4
 * sem compressão, fonte Helvetica e, com senha, a criptografia padrão RC4 de 40 bits (revisão 2),
 * a mesma família usada por bancos para proteger a fatura com o CPF.
 */

export const NEON_HEADER = ['Data', 'Descrição', 'Parcela', 'Cartão', 'Valores em US$', 'Valores em R$'];

/** Página do PDF: lista de linhas; cada linha, a lista de células da esquerda para a direita. */
export type PdfPage = string[][];

export type NeonPdfOptions = {
    /** Protege o PDF com essa senha de usuário. */
    password?: string;
    /** Termina o conteúdo da primeira página com uma imagem que não existe (PDF corrompido). */
    brokenContent?: boolean;
};

/** Preenchimento fixo da especificação do PDF para senhas (Algoritmo 2). */
const PASSWORD_PADDING = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const DOCUMENT_ID = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
const PERMISSIONS = -4;
const OWNER_PASSWORD = 'dono-do-arquivo';

export function buildNeonPdf(pages: PdfPage[], options: NeonPdfOptions = {}): Buffer {
    const fileKey = options.password === undefined ? undefined : encryptionKey(options.password);
    const objects: Buffer[] = [];
    const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');

    objects.push(latin1('<< /Type /Catalog /Pages 2 0 R >>'));
    objects.push(latin1(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
    objects.push(latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));

    pages.forEach((rows, index) => {
        const contentNumber = 5 + index * 2;
        const text = rows
            .flatMap((cells, row) => cells.map((cell, column) =>
                `BT /F1 9 Tf ${30 + column * 130} ${560 - row * 20} Td (${escapePdfText(cell)}) Tj ET`))
            .concat(options.brokenContent && index === 0 ? ['/ImagemQueNaoExiste Do'] : [])
            .join('\n');
        const content = fileKey ? rc4(objectKey(fileKey, contentNumber), latin1(text)) : latin1(text);

        objects.push(latin1(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`
        ));
        objects.push(Buffer.concat([latin1(`<< /Length ${content.length} >>\nstream\n`), content, latin1('\nendstream')]));
    });

    if (fileKey) {
        objects.push(latin1(fileKey.dictionary));
    }

    const trailerExtra = fileKey
        ? ` /Encrypt ${objects.length} 0 R /ID [<${DOCUMENT_ID.toString('hex')}> <${DOCUMENT_ID.toString('hex')}>]`
        : '';

    return assemble(objects, trailerExtra);
}

function assemble(objects: Buffer[], trailerExtra: string): Buffer {
    const chunks = [latin1('%PDF-1.4\n')];
    const offsets: number[] = [];
    let offset = chunks[0].length;

    objects.forEach((body, index) => {
        const chunk = Buffer.concat([latin1(`${index + 1} 0 obj\n`), body, latin1('\nendobj\n')]);

        offsets.push(offset);
        chunks.push(chunk);
        offset += chunk.length;
    });

    const xref = [
        `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
        ...offsets.map(position => `${String(position).padStart(10, '0')} 00000 n \n`)
    ].join('');

    chunks.push(latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\nstartxref\n${offset}\n%%EOF\n`));

    return Buffer.concat(chunks);
}

type FileKey = {
    key: Buffer;
    dictionary: string;
};

/** Algoritmos 2, 3 e 4 da especificação (revisão 2, chave de 40 bits). */
function encryptionKey(password: string): FileKey {
    const ownerHash = md5(padPassword(OWNER_PASSWORD)).subarray(0, 5);
    const owner = rc4(ownerHash, padPassword(password));
    const permissions = Buffer.alloc(4);

    permissions.writeInt32LE(PERMISSIONS);

    const key = md5(Buffer.concat([padPassword(password), owner, permissions, DOCUMENT_ID])).subarray(0, 5);
    const user = rc4(key, PASSWORD_PADDING);

    return {
        key,
        dictionary: `<< /Filter /Standard /V 1 /R 2 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P ${PERMISSIONS} >>`
    };
}

/* eslint-disable no-bitwise -- a chave do PDF e o RC4 são definidos com operações de bits */
/** Chave de cada objeto: a do arquivo + número do objeto (3 bytes) + geração (2 bytes). */
function objectKey(fileKey: FileKey, objectNumber: number): Buffer {
    const suffix = Buffer.from([objectNumber & 0xff, (objectNumber >> 8) & 0xff, (objectNumber >> 16) & 0xff, 0, 0]);

    return md5(Buffer.concat([fileKey.key, suffix])).subarray(0, fileKey.key.length + 5);
}

function padPassword(password: string): Buffer {
    return Buffer.concat([latin1(password), PASSWORD_PADDING]).subarray(0, 32);
}

function md5(data: Buffer): Buffer {
    return createHash('md5').update(data).digest();
}

/** RC4 (o OpenSSL 3 não traz mais por padrão). */
function rc4(key: Buffer, data: Buffer): Buffer {
    const state = Array.from({ length: 256 }, (_, index) => index);
    let j = 0;

    for (let position = 0; position < 256; position++) {
        j = (j + state[position] + key[position % key.length]) & 0xff;
        [state[position], state[j]] = [state[j], state[position]];
    }

    const output = Buffer.alloc(data.length);
    let i = 0;
    j = 0;

    for (let index = 0; index < data.length; index++) {
        i = (i + 1) & 0xff;
        j = (j + state[i]) & 0xff;
        [state[i], state[j]] = [state[j], state[i]];
        output[index] = data[index] ^ state[(state[i] + state[j]) & 0xff];
    }

    return output;
}
/* eslint-enable no-bitwise */

function escapePdfText(text: string): string {
    return text.replace(/([\\()])/g, '\\$1');
}

/** A fonte usa WinAnsiEncoding: acentos do português cabem em um byte (latin1). */
function latin1(text: string): Buffer {
    return Buffer.from(text, 'latin1');
}
