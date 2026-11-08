import type { CreditCard } from '../../../generated/prisma/client.js';
import type { TestResponse } from '../../../testing/http-test-app.js';
import { jest } from '@jest/globals';
import type { AddressInfo } from 'node:net';

import { CardBank } from '../../../generated/prisma/client.js';
import { dataOf, errorOf, HttpTestApp } from '../../../testing/http-test-app.js';
import { CARD_EXPENSE_SCOPES } from '../../card-expenses/service/card-expense-scope.js';
import { CategoryRepository } from '../../categories/repository/category.repository.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { CreditCardRepository } from '../../credit-cards/repository/credit-card.repository.js';
import { PersonRepository } from '../../people/repository/person.repository.js';
import { CardImportRepository } from '../repository/card-import.repository.js';
import { InMemoryCreditCardRepository, InMemoryPersonRepository } from './in-memory-card-import-dependencies.js';
import { InMemoryCardImportRepository } from './in-memory-card-import.repository.js';
import { buildNeonPdf, NEON_HEADER } from './neon-pdf.fixture.js';

/*
 * Rotas /card-imports por HTTP: o formulário multipart de verdade (com FormData, como o front
 * manda), os limites do upload, a validação dos campos, os códigos de status e o envelope
 * { data } / { error }. As regras finas ficam no card-import.service.spec.
 */

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LARGE_FIELD_BYTES = 256 * 1024;
const NUBANK_CSV = [
    'date,title,amount',
    '2026-11-03,Pagamento recebido,"- 1.981,55"',
    '2026-10-26,Loja Exemplo - Parcela 4/8,"66,38"',
    '2026-10-20,Padaria,"12,00"'
].join('\n');

type FormFile = { field?: string; fileName: string; content: string | Buffer };

/** Monta o formulário: o arquivo (ou arquivos) e os campos de texto, na ordem pedida. */
function form(fields: Record<string, string>, files: FormFile[] = [], filesFirst = false): FormData {
    const data = new FormData();
    const appendFiles = (): void => {
        for (const file of files) {
            const content = typeof file.content === 'string' ? Buffer.from(file.content) : file.content;
            data.append(file.field ?? 'file', new Blob([new Uint8Array(content)]), file.fileName);
        }
    };

    if (filesFirst) {
        appendFiles();
    }

    for (const [name, value] of Object.entries(fields)) {
        data.append(name, value);
    }

    if (!filesFirst) {
        appendFiles();
    }

    return data;
}

/** Corpo multipart montado à mão, para partes que o FormData não gera (ex.: campo com Content-Type). */
function rawMultipart(boundary: string, parts: Array<{ name: string; contentType?: string; fileName?: string; content: string }>): Buffer {
    const body = parts.map(part => [
        `--${boundary}`,
        `Content-Disposition: form-data; name="${part.name}"${part.fileName ? `; filename="${part.fileName}"` : ''}`,
        ...(part.contentType ? [`Content-Type: ${part.contentType}`] : []),
        '',
        part.content
    ].join('\r\n'));

    return Buffer.from([...body, `--${boundary}--`, ''].join('\r\n'));
}

/*
 * O card-expense.dto.ts (módulo de despesas do cartão) importa o tipo CardExpenseScope sem "import type"
 * e o usa numa propriedade com decorator. Com emitDecoratorMetadata + isolatedModules, o ts-jest mantém
 * esse import e o Jest em modo ESM recusa o arquivo ("does not provide an export named
 * 'CardExpenseScope'"). As classes de lá só servem à documentação (Swagger, desligado nos testes),
 * então o teste as troca por versões vazias e carrega o módulo depois disso.
 */
jest.unstable_mockModule('../../card-expenses/dto/card-expense.dto.js', () => ({
    CardExpenseResponse: class CardExpenseResponse { },
    CardInstallmentDto: class CardInstallmentDto { },
    SCOPE_PROPERTY: { type: String, enum: CARD_EXPENSE_SCOPES }
}));

describe('rotas /card-imports', () => {
    const imports = new InMemoryCardImportRepository();
    const cards = new InMemoryCreditCardRepository();
    const categories = new InMemoryCategoryRepository();
    const people = new InMemoryPersonRepository();
    let api: HttpTestApp;
    let card: CreditCard;

    // Uma API para o arquivo todo (subir o Nest a cada teste deixaria a suíte lenta); os dados
    // em memória recomeçam a cada teste.
    beforeAll(async () => {
        const cardImportsModule = (await import('../card-imports.module.js')).CardImportsModule;

        api = await HttpTestApp.create({
            imports: [cardImportsModule],
            overrides: [
                { provide: CardImportRepository, useValue: imports },
                { provide: CreditCardRepository, useValue: cards },
                { provide: CategoryRepository, useValue: categories },
                { provide: PersonRepository, useValue: people }
            ]
        });
    });

    beforeEach(() => {
        imports.imports.clear();
        imports.expenses.clear();
        cards.cards.clear();
        categories.categories.clear();
        people.people.clear();
        categories.seed({ name: 'Outros', isDefault: true });
        card = cards.seed({ bank: CardBank.NUBANK });
    });

    afterAll(async () => {
        await api.close();
    });

    /** POST com corpo multipart (FormData ou bytes prontos), com o token do usuário de teste. */
    const postMultipart = async (
        path: string,
        body: FormData | Buffer,
        options: { contentType?: string; auth?: boolean } = {}
    ): Promise<TestResponse> => {
        const { port } = api.app.getHttpServer().address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
            method: 'POST',
            headers: {
                ...(options.auth === false ? {} : { authorization: `Bearer ${api.accessToken}` }),
                ...(options.contentType ? { 'content-type': options.contentType } : {})
            },
            body: body instanceof FormData ? body : new Uint8Array(body)
        });
        const text = await response.text();

        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: text ? JSON.parse(text) as unknown : undefined
        };
    };

    const nubankForm = (extra: Record<string, string> = {}, file: Partial<FormFile> = {}): FormData =>
        form({ cardId: card.id, month: '2026-11', ...extra }, [{ fileName: 'Nubank_2026-11.csv', content: NUBANK_CSV, ...file }]);

    const expectError = (response: TestResponse, status: number, code: string, message?: string): void => {
        expect(response.status).toBe(status);
        expect(errorOf(response)).toMatchObject({ code, ...(message ? { message } : {}) });
    };

    it('exige login (401) em todas as rotas', async () => {
        const responses = [
            await postMultipart('/card-imports', nubankForm(), { auth: false }),
            await postMultipart('/card-imports/preview', nubankForm(), { auth: false }),
            await api.get('/card-imports', { auth: false }),
            await api.get(`/card-imports/${MISSING_ID}`, { auth: false }),
            await api.delete(`/card-imports/${MISSING_ID}`, { auth: false })
        ];

        for (const response of responses) {
            expectError(response, 401, 'AUTH_UNAUTHENTICATED');
        }
        expect(imports.imports.size).toBe(0);
    });

    describe('POST /card-imports/preview', () => {
        it('devolve 200 com o plano, sem gravar nada (overrides e exclusions são ignorados)', async () => {
            const response = await postMultipart('/card-imports/preview', nubankForm({ overrides: 'não é json', exclusions: '{' }));

            expect(response.status).toBe(200);
            expect(dataOf(response)).toMatchObject({
                cardId: card.id,
                month: '2026-11',
                fileName: 'Nubank_2026-11.csv',
                transactions: [
                    { key: 'P|2026-08|8|LOJA EXEMPLO', status: 'new', amount: '66.38', installment: { number: 4, total: 8 }, projectedCount: 4 },
                    { key: 'S|2026-10-20|1200|PADARIA', status: 'new', amount: '12.00', installment: null, projectedCount: 0 }
                ],
                removed: [],
                summary: { created: 2, updated: 0, removed: 0, projected: 4, ignored: 1 }
            });
            expect(imports.imports.size).toBe(0);
            expect(imports.expenses.size).toBe(0);
        });
    });

    describe('POST /card-imports', () => {
        it('importa a fatura (201) com as escolhas e decisões da pré-visualização; o arquivo pode vir antes dos campos', async () => {
            const casa = categories.seed({ name: 'Casa' });
            const ana = people.seed({ name: 'Ana' });
            const overrides = JSON.stringify([
                { key: 'P|2026-08|8|LOJA EXEMPLO', nickname: '  Geladeira  ', categoryId: casa.id, split: 'PERSONAL', personId: ana.id }
            ]);
            const exclusions = JSON.stringify([{ key: 'S|2026-10-20|1200|PADARIA', action: 'exclude', scope: 'all' }]);

            const response = await postMultipart('/card-imports', form(
                { cardId: card.id, month: '2026-11', overrides, exclusions },
                [{ fileName: 'Nubank_2026-11.csv', content: NUBANK_CSV }],
                true
            ));

            expect(response.status).toBe(201);
            expect(dataOf(response)).toMatchObject({
                import: { cardId: card.id, month: '2026-11', fileName: 'Nubank_2026-11.csv', parserVersion: 'nubank-csv@1', rowCount: 2, ignoredCount: 1, expenseCount: 6 },
                summary: { created: 2, updated: 0, removed: 0, projected: 4, ignored: 1 }
            });

            const rows = imports.expensesOf(card.id);

            expect(rows.filter(row => row.nickname === 'Geladeira' && row.categoryId === casa.id && row.personId === ana.id)).toHaveLength(5);
            expect(rows.find(row => row.originalDescription === 'Padaria')).toMatchObject({ split: 'PENDING', personId: null });
            expect(rows.find(row => row.originalDescription === 'Padaria')).toMatchObject({ exclusionRemembered: false });
            expect(rows.find(row => row.originalDescription === 'Padaria')?.excludedAt).toBeInstanceOf(Date);
        });

        it('sem overrides e exclusions, grava com as sugestões', async () => {
            const response = await postMultipart('/card-imports', nubankForm());

            expect(response.status).toBe(201);
            expect(imports.expensesOf(card.id).every(row => row.nickname === null && row.excludedAt === null)).toBe(true);
        });

        it('PDF do Neon com senha: o arquivo binário chega inteiro e a senha vai para o leitor', async () => {
            const neon = cards.seed({ bank: CardBank.NEON });
            const pdf = buildNeonPdf([[NEON_HEADER, ['08/11', 'MERCADO', '-', 'Virtual - 0192', '-', '45,00']]], { password: '12345678900' });

            const withoutPassword = await postMultipart('/card-imports', form({ cardId: neon.id, month: '2026-11' }, [{ fileName: 'neon.pdf', content: pdf }]));
            const withPassword = await postMultipart('/card-imports', form(
                { cardId: neon.id, month: '2026-11', password: '12345678900' },
                [{ fileName: 'neon.pdf', content: pdf }]
            ));

            expectError(withoutPassword, 422, 'IMPORT_FILE_PASSWORD_INVALID', 'O arquivo é protegido: informe a senha correta no campo password');
            expect(withPassword.status).toBe(201);
            expect(dataOf(withPassword)).toMatchObject({ import: { parserVersion: 'neon-pdf@1', rowCount: 1 } });
        });

        it('sem formulário multipart, sem arquivo, com arquivo vazio ou em outro campo: 400 IMPORT_FILE_REQUIRED', async () => {
            const message = 'Envie a fatura no campo file de um formulário multipart';
            const responses = [
                await api.post('/card-imports', { cardId: card.id, month: '2026-11' }),
                await postMultipart('/card-imports', form({ cardId: card.id, month: '2026-11' })),
                await postMultipart('/card-imports', nubankForm({}, { content: '' })),
                await postMultipart('/card-imports', nubankForm({}, { field: 'arquivo' })),
                await postMultipart('/card-imports/preview', form({ cardId: card.id, month: '2026-11' }))
            ];

            for (const response of responses) {
                expectError(response, 400, 'IMPORT_FILE_REQUIRED', message);
            }
            expect(imports.imports.size).toBe(0);
        });

        it('valida os campos do formulário (400 VALIDATION_ERROR): obrigatórios, formato e campos extras', async () => {
            const missing = await postMultipart('/card-imports', form({}, [{ fileName: 'fatura.csv', content: NUBANK_CSV }]));
            const invalid = await postMultipart('/card-imports', nubankForm({ cardId: '123', month: '2026-13', bank: 'NUBANK' }));

            expectError(missing, 400, 'VALIDATION_ERROR');
            expect(errorOf(missing).details).toEqual([
                expect.objectContaining({ field: 'cardId', code: 'any.required' }),
                expect.objectContaining({ field: 'month', code: 'any.required' })
            ]);
            expectError(invalid, 400, 'VALIDATION_ERROR');
            expect(errorOf(invalid).details).toEqual([
                expect.objectContaining({ field: 'cardId', code: 'string.guid' }),
                expect.objectContaining({ field: 'month', message: 'O mês deve estar no formato AAAA-MM' }),
                expect.objectContaining({ field: 'bank', code: 'object.unknown' })
            ]);
        });

        it('overrides e exclusions com JSON inválido ou itens inválidos: 400 apontando o campo', async () => {
            const badJson = await postMultipart('/card-imports', nubankForm({ overrides: '[{' }));
            const badItem = await postMultipart('/card-imports', nubankForm({ exclusions: JSON.stringify([{ key: 'x', action: 'apagar', scope: 'all' }]) }));

            expectError(badJson, 400, 'VALIDATION_ERROR');
            expect(errorOf(badJson).details).toEqual([{ field: 'overrides', code: 'json.invalid', message: 'overrides deve conter um JSON válido' }]);
            expectError(badItem, 400, 'VALIDATION_ERROR');
            expect(errorOf(badItem).details).toEqual([expect.objectContaining({ field: 'exclusions[0].action', code: 'any.only' })]);
            expect(imports.imports.size).toBe(0);
        });

        it('escolha com key que não está no arquivo: 400 IMPORT_OVERRIDE_UNKNOWN_KEY', async () => {
            const outros = [...categories.categories.values()][0];
            const response = await postMultipart('/card-imports', nubankForm({
                overrides: JSON.stringify([{ key: 'S|2026-01-01|1|SUMIU', nickname: null, categoryId: outros.id, split: 'SHARED' }])
            }));

            expectError(response, 400, 'IMPORT_OVERRIDE_UNKNOWN_KEY', 'A fatura mudou desde a pré-visualização; pré-visualize de novo');
        });

        it('erros do serviço chegam com status e mensagem: cartão inexistente, tipo de arquivo e formato', async () => {
            const notFound = await postMultipart('/card-imports', form({ cardId: MISSING_ID, month: '2026-11' }, [{ fileName: 'f.csv', content: NUBANK_CSV }]));
            const wrongType = await postMultipart('/card-imports', nubankForm({}, { fileName: 'fatura.pdf' }));
            const wrongFormat = await postMultipart('/card-imports', nubankForm({}, { content: 'Data;Valor\n01/11/2026;10.00' }));

            expectError(notFound, 404, 'CREDIT_CARD_NOT_FOUND');
            expectError(wrongType, 400, 'IMPORT_INVALID_FILE_TYPE', 'O tipo de arquivo não é aceito para o banco deste cartão');
            expectError(wrongFormat, 422, 'IMPORT_UNSUPPORTED_FORMAT');
        });
    });

    describe('limites do formulário', () => {
        it('arquivo de até 2 MB passa; acima disso é 413 IMPORT_FILE_TOO_LARGE', async () => {
            const atLimit = await postMultipart('/card-imports', nubankForm({}, { fileName: 'fatura.txt', content: Buffer.alloc(MAX_FILE_BYTES, 'a') }));
            const overLimit = await postMultipart('/card-imports', nubankForm({}, { content: Buffer.alloc(MAX_FILE_BYTES + 1, 'a') }));

            // No limite, o upload foi lido inteiro e a recusa já é a do tipo do arquivo.
            expectError(atLimit, 400, 'IMPORT_INVALID_FILE_TYPE');
            expectError(overLimit, 413, 'IMPORT_FILE_TOO_LARGE', 'O arquivo da fatura deve ter no máximo 2 MB');
        });

        it('campos comuns até 200 bytes (contando bytes, não letras); acima disso é 400 com o limite', async () => {
            const atLimit = await postMultipart('/card-imports', nubankForm({ password: 'x'.repeat(200) }));
            const overLimit = await postMultipart('/card-imports', nubankForm({ password: 'x'.repeat(201) }));
            const accents = await postMultipart('/card-imports', nubankForm({ password: 'é'.repeat(101) }));

            // 200 bytes passam pelo limite do formulário e caem na regra da senha (até 100 caracteres).
            expectError(atLimit, 400, 'VALIDATION_ERROR');
            expect(errorOf(atLimit).details).toEqual([expect.objectContaining({ field: 'password', code: 'string.max', message: 'password deve ter no máximo 100 caracteres' })]);

            for (const response of [overLimit, accents]) {
                expectError(response, 400, 'VALIDATION_ERROR');
                expect(errorOf(response).details).toEqual([{ field: 'password', code: 'string.max', message: 'password deve ter no máximo 200 bytes' }]);
            }
        });

        it('overrides e exclusions podem ter até 256 KiB; acima disso é 400 com o limite', async () => {
            // JSON válido ("[]" seguido de espaços) com o tamanho exato do limite.
            const atLimit = await postMultipart('/card-imports', nubankForm({ overrides: `[]${' '.repeat(MAX_LARGE_FIELD_BYTES - 2)}` }));
            const overLimit = await postMultipart('/card-imports', nubankForm({
                overrides: `[]${' '.repeat(MAX_LARGE_FIELD_BYTES - 1)}`,
                exclusions: `[]${' '.repeat(MAX_LARGE_FIELD_BYTES - 1)}`
            }));

            expect(atLimit.status).toBe(201);
            expectError(overLimit, 400, 'VALIDATION_ERROR');
            expect(errorOf(overLimit).details).toEqual([
                { field: 'overrides', code: 'string.max', message: 'overrides deve ter no máximo 262144 bytes' },
                { field: 'exclusions', code: 'string.max', message: 'exclusions deve ter no máximo 262144 bytes' }
            ]);
        });

        it('um arquivo só e no máximo 6 campos: além disso é 400 IMPORT_FILE_REQUIRED', async () => {
            const twoFiles = await postMultipart('/card-imports', form({ cardId: card.id, month: '2026-11' }, [
                { fileName: 'a.csv', content: NUBANK_CSV },
                { fileName: 'b.csv', content: NUBANK_CSV }
            ]));
            const sixFields = await postMultipart('/card-imports', nubankForm({ password: 'x', overrides: '[]', exclusions: '[]', extra: '1' }));
            const sevenFields = await postMultipart('/card-imports', nubankForm({ password: 'x', overrides: '[]', exclusions: '[]', extra: '1', outro: '2' }));

            expectError(twoFiles, 400, 'IMPORT_FILE_REQUIRED');
            // Seis campos ainda são lidos: a recusa é a do campo desconhecido.
            expectError(sixFields, 400, 'VALIDATION_ERROR');
            expect(errorOf(sixFields).details).toEqual([expect.objectContaining({ field: 'extra', code: 'object.unknown' })]);
            expectError(sevenFields, 400, 'IMPORT_FILE_REQUIRED');
            expect(imports.imports.size).toBe(0);
        });

        it('campo enviado como JSON (Content-Type application/json) não é texto e fica de fora', async () => {
            const boundary = 'limite-do-teste';
            const response = await postMultipart('/card-imports', rawMultipart(boundary, [
                { name: 'cardId', content: card.id },
                { name: 'month', content: '2026-11' },
                { name: 'overrides', contentType: 'application/json', content: '[{"key":"x"}]' },
                { name: 'file', fileName: 'fatura.csv', contentType: 'text/csv', content: NUBANK_CSV }
            ]), { contentType: `multipart/form-data; boundary=${boundary}` });

            expect(response.status).toBe(201);
        });
    });

    describe('histórico', () => {
        it('GET lista os uploads (filtros por cartão e mês); filtro inválido ou desconhecido é 400', async () => {
            const old = imports.seedImport({ cardId: card.id, month: new Date('2026-10-01T00:00:00.000Z'), createdAt: new Date('2026-10-05T00:00:00.000Z') });
            const recent = imports.seedImport({ cardId: card.id, month: new Date('2026-11-01T00:00:00.000Z'), createdAt: new Date('2026-11-05T00:00:00.000Z') });

            const all = await api.get('/card-imports');
            const byMonth = await api.get('/card-imports', { query: { cardId: card.id, month: '2026-10' } });
            const invalid = await api.get('/card-imports', { query: { month: '10/2026' } });
            const unknown = await api.get('/card-imports', { query: { page: 1 } });

            expect(all.status).toBe(200);
            expect(dataOf<Array<{ id: string }>>(all).map(item => item.id)).toEqual([recent.id, old.id]);
            expect(dataOf(byMonth)).toEqual([expect.objectContaining({ id: old.id, month: '2026-10', expenseCount: 0 })]);
            expectError(invalid, 400, 'VALIDATION_ERROR');
            expectError(unknown, 400, 'VALIDATION_ERROR');
        });

        it('GET /:id devolve o upload; id que não é UUID é 400 e inexistente é 404', async () => {
            const cardImport = imports.seedImport({ cardId: card.id, month: new Date('2026-11-01T00:00:00.000Z') });

            const found = await api.get(`/card-imports/${cardImport.id}`);
            const notUuid = await api.get('/card-imports/123');
            const missing = await api.get(`/card-imports/${MISSING_ID}`);

            expect(found.status).toBe(200);
            expect(dataOf(found)).toMatchObject({ id: cardImport.id, month: '2026-11' });
            expect(dataOf<Record<string, unknown>>(found)).not.toHaveProperty('fileHash');
            expectError(notUuid, 400, 'VALIDATION_ERROR');
            expectError(missing, 404, 'CARD_IMPORT_NOT_FOUND', 'Upload de fatura não encontrado');
        });

        it('DELETE /:id apaga (204, sem corpo) o upload e as despesas dele; de novo é 404', async () => {
            const created = await postMultipart('/card-imports', nubankForm());
            const { id } = dataOf<{ import: { id: string } }>(created).import;

            const removed = await api.delete(`/card-imports/${id}`);
            const again = await api.delete(`/card-imports/${id}`);
            const notUuid = await api.delete('/card-imports/123');

            expect(removed.status).toBe(204);
            expect(removed.body).toBeUndefined();
            expect(imports.imports.size).toBe(0);
            expect(imports.expenses.size).toBe(0);
            expectError(again, 404, 'CARD_IMPORT_NOT_FOUND');
            expectError(notUuid, 400, 'VALIDATION_ERROR');
        });
    });
});
