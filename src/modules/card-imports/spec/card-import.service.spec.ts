import type { CardExpense, Category, CreditCard } from '../../../generated/prisma/client.js';
import type { AppError } from '../../common/errors/app-error.js';
import type { CardImportExclusionDto, CardImportOverrideDto } from '../dto/card-import.dto.js';
import type { ApplyCardImportInput, CardImportRepository } from '../repository/card-import.repository.js';
import type { UploadedStatementFile } from '../service/card-import.service.js';
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';

import { CardBank } from '../../../generated/prisma/client.js';
import { CategoryRepository } from '../../categories/repository/category.repository.js';
import { CategoryService } from '../../categories/service/category.service.js';
import { InMemoryCategoryRepository } from '../../categories/spec/in-memory-category.repository.js';
import { CreditCardRepository } from '../../credit-cards/repository/credit-card.repository.js';
import { CreditCardService } from '../../credit-cards/service/credit-card.service.js';
import { PersonRepository } from '../../people/repository/person.repository.js';
import { PersonService } from '../../people/service/person.service.js';
import { C6CsvParser } from '../parsers/c6-csv.parser.js';
import { CardStatementParserRegistry } from '../parsers/card-statement-parser.registry.js';
import { NeonPdfParser } from '../parsers/neon-pdf.parser.js';
import { NubankCsvParser } from '../parsers/nubank-csv.parser.js';
import { CardImportService } from '../service/card-import.service.js';
import { InMemoryCreditCardRepository, InMemoryPersonRepository } from './in-memory-card-import-dependencies.js';
import { InMemoryCardImportRepository } from './in-memory-card-import.repository.js';
import { buildNeonPdf, NEON_HEADER } from './neon-pdf.fixture.js';

const MISSING_ID = '3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f';
const NOVEMBER = new Date('2026-11-01T00:00:00.000Z');
const DECEMBER = new Date('2026-12-01T00:00:00.000Z');

const nubankCsv = (...lines: string[]): Buffer => Buffer.from(['date,title,amount', ...lines].join('\n'));
const c6Csv = (...lines: string[]): Buffer => Buffer.from([
    'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)',
    ...lines
].join('\n'));
const sha256 = (content: Buffer | string): string => createHash('sha256').update(content).digest('hex');

/** Fatura de novembro do Nubank: uma compra parcelada (4/8), uma à vista e um pagamento (ignorado). */
const NUBANK_NOVEMBER = nubankCsv(
    '2026-11-03,Pagamento recebido,"- 1.981,55"',
    '2026-10-26,Loja Exemplo - Parcela 4/8,"66,38"',
    '2026-10-20,Padaria,"12,00"'
);
const LOJA_KEY = 'P|2026-08|8|LOJA EXEMPLO';
const PADARIA_KEY = 'S|2026-10-20|1200|PADARIA';

/** Regras do upload de faturas, com repositórios em memória e os parsers de verdade. */
describe('CardImportService', () => {
    let imports: InMemoryCardImportRepository;
    let cards: InMemoryCreditCardRepository;
    let categories: InMemoryCategoryRepository;
    let people: InMemoryPersonRepository;
    let nubank: NubankCsvParser;
    let service: CardImportService;
    let nubankCard: CreditCard;
    let outros: Category;

    beforeEach(() => {
        imports = new InMemoryCardImportRepository();
        cards = new InMemoryCreditCardRepository();
        categories = new InMemoryCategoryRepository();
        people = new InMemoryPersonRepository();
        nubank = new NubankCsvParser();
        service = new CardImportService(
            imports as unknown as CardImportRepository,
            new CreditCardService(cards as unknown as CreditCardRepository),
            new CategoryService(categories as unknown as CategoryRepository),
            new PersonService(people as unknown as PersonRepository),
            new CardStatementParserRegistry(nubank, new C6CsvParser(), new NeonPdfParser())
        );
        nubankCard = cards.seed({ bank: CardBank.NUBANK });
        outros = categories.seed({ name: 'Outros', isDefault: true });
    });

    /** Confere o erro devolvido ao cliente (código e status) e o motivo que vai para o log. */
    const expectAppError = async (promise: Promise<unknown>, expected: { code: string; statusCode: number; reason: string }): Promise<void> => {
        await expect(promise).rejects.toMatchObject(expected satisfies Partial<AppError>);
    };

    const upload = (fileName: string, content: Buffer): UploadedStatementFile => ({ fileName, content });

    const createNubank = async (
        overrides?: CardImportOverrideDto[],
        exclusions?: CardImportExclusionDto[]
    ) => service.create({ cardId: nubankCard.id, month: '2026-11' }, upload('Nubank_2026-11.csv', NUBANK_NOVEMBER), overrides, exclusions);

    /** Captura o que o serviço manda o repositório gravar. */
    const spyApply = () => jest.spyOn(imports, 'apply');

    const lastApplied = (apply: ReturnType<typeof spyApply>): ApplyCardImportInput => apply.mock.calls[apply.mock.calls.length - 1][0];

    describe('create (upload do arquivo)', () => {
        it('as compras de "Adicionar compra" do mês ficam: o upload não as apaga', async () => {
            const manual = imports.seedExpense({
                cardId: nubankCard.id, importId: null, origin: 'MANUAL', month: NOVEMBER, purchaseKey: 'M|lancada-a-mao', categoryId: outros.id
            });
            const fromUpload = imports.seedExpense({
                cardId: nubankCard.id, importId: null, origin: 'SYNC', month: NOVEMBER, purchaseKey: 'S|2026-11-01|500|OUTRA', categoryId: outros.id
            });

            const result = await createNubank();

            expect(imports.expenses.has(manual.id)).toBe(true);
            expect(imports.expenses.has(fromUpload.id)).toBe(false);
            expect(result.summary.removed).toBe(1);
        });

        it('grava o upload e as despesas e devolve o histórico com o resumo', async () => {
            const result = await createNubank();
            const [stored] = [...imports.imports.values()];

            expect(result).toEqual({
                import: {
                    id: stored.id,
                    cardId: nubankCard.id,
                    month: '2026-11',
                    fileName: 'Nubank_2026-11.csv',
                    parserVersion: 'nubank-csv@1',
                    rowCount: 2,
                    ignoredCount: 1,
                    // As duas linhas do mês e as parcelas 5/8 a 8/8 projetadas.
                    expenseCount: 6,
                    createdAt: stored.createdAt
                },
                summary: { created: 2, updated: 0, removed: 0, projected: 4, ignored: 1 }
            });
            expect(stored).toMatchObject({
                cardId: nubankCard.id,
                month: NOVEMBER,
                fileName: 'Nubank_2026-11.csv',
                fileHash: sha256(NUBANK_NOVEMBER),
                parserVersion: 'nubank-csv@1',
                rowCount: 2,
                ignoredCount: 1
            });

            const rows = imports.expensesOf(nubankCard.id);

            expect(rows.map(row => [row.month.toISOString().slice(0, 7), row.purchaseKey, row.installmentNumber])).toEqual([
                ['2026-11', LOJA_KEY, 4],
                ['2026-11', PADARIA_KEY, null],
                ['2026-12', LOJA_KEY, 5],
                ['2027-01', LOJA_KEY, 6],
                ['2027-02', LOJA_KEY, 7],
                ['2027-03', LOJA_KEY, 8]
            ]);
            expect(rows[1]).toMatchObject({
                importId: stored.id,
                transactionDate: new Date('2026-10-20T00:00:00.000Z'),
                originalDescription: 'Padaria',
                amountCents: 1200n,
                categoryId: outros.id,
                nickname: null,
                split: 'PENDING',
                personId: null,
                excludedAt: null
            });
        });

        it('mandar o mesmo arquivo de novo atualiza as despesas; o que sumiu do arquivo sai do mês', async () => {
            await createNubank();
            await service.create(
                { cardId: nubankCard.id, month: '2026-11' },
                upload('Nubank_2026-11.csv', nubankCsv('2026-10-26,Loja Exemplo - Parcela 4/8,"66,38"'))
            );

            const result = await createNubank();

            expect(result.summary).toEqual({ created: 1, updated: 1, removed: 0, projected: 4, ignored: 1 });
            // expenseCount conta o que este upload gravou (atualizadas + criadas), não o que já existia.
            expect(result.import.expenseCount).toBe(6);
            expect(imports.expensesOf(nubankCard.id)).toHaveLength(6);

            const removing = await service.create(
                { cardId: nubankCard.id, month: '2026-11' },
                upload('Nubank_2026-11.csv', nubankCsv('2026-10-20,Padaria,"12,00"'))
            );

            expect(removing.summary).toEqual({ created: 0, updated: 1, removed: 5, projected: 0, ignored: 0 });
            expect(removing.import).toMatchObject({ rowCount: 1, ignoredCount: 0, expenseCount: 1 });
            expect(imports.expensesOf(nubankCard.id).map(row => row.purchaseKey)).toEqual([PADARIA_KEY]);
        });

        it('confere o cartão: inexistente é 404 e inativo é 409, sem ler o arquivo', async () => {
            const inactive = cards.seed({ active: false });
            const parse = jest.spyOn(nubank, 'parse');
            const apply = spyApply();
            const file = upload('fatura.csv', NUBANK_NOVEMBER);

            await expectAppError(service.create({ cardId: MISSING_ID, month: '2026-11' }, file), {
                code: 'CREDIT_CARD_NOT_FOUND', statusCode: 404, reason: 'credit_card_id_not_found'
            });
            await expectAppError(service.create({ cardId: inactive.id, month: '2026-11' }, file), {
                code: 'CREDIT_CARD_INACTIVE', statusCode: 409, reason: 'credit_card_inactive'
            });
            expect(parse).not.toHaveBeenCalled();
            expect(apply).not.toHaveBeenCalled();
        });

        it('a extensão do arquivo precisa ser a do banco do cartão (sem diferenciar maiúsculas)', async () => {
            const c6Card = cards.seed({ bank: CardBank.C6 });
            const neonCard = cards.seed({ bank: CardBank.NEON });
            const parse = jest.spyOn(nubank, 'parse');

            await expectAppError(service.create({ cardId: nubankCard.id, month: '2026-11' }, upload('fatura.pdf', NUBANK_NOVEMBER)), {
                code: 'IMPORT_INVALID_FILE_TYPE', statusCode: 400, reason: 'expected_csv_for_nubank'
            });
            await expectAppError(service.create({ cardId: nubankCard.id, month: '2026-11' }, upload('fatura.csv.txt', NUBANK_NOVEMBER)), {
                code: 'IMPORT_INVALID_FILE_TYPE', statusCode: 400, reason: 'expected_csv_for_nubank'
            });
            await expectAppError(service.create({ cardId: nubankCard.id, month: '2026-11' }, upload('csv', NUBANK_NOVEMBER)), {
                code: 'IMPORT_INVALID_FILE_TYPE', statusCode: 400, reason: 'expected_csv_for_nubank'
            });
            await expectAppError(service.create({ cardId: c6Card.id, month: '2026-11' }, upload('fatura.xlsx', NUBANK_NOVEMBER)), {
                code: 'IMPORT_INVALID_FILE_TYPE', statusCode: 400, reason: 'expected_csv_for_c6'
            });
            await expectAppError(service.create({ cardId: neonCard.id, month: '2026-11' }, upload('fatura.csv', NUBANK_NOVEMBER)), {
                code: 'IMPORT_INVALID_FILE_TYPE', statusCode: 400, reason: 'expected_pdf_for_neon'
            });
            expect(parse).not.toHaveBeenCalled();

            await expect(service.create({ cardId: nubankCard.id, month: '2026-11' }, upload('FATURA.CSV', NUBANK_NOVEMBER))).resolves.toMatchObject({
                import: { fileName: 'FATURA.CSV' }
            });
        });

        it('entrega ao parser o conteúdo, o mês da fatura (ano e mês) e a senha', async () => {
            const parse = jest.spyOn(nubank, 'parse');

            await service.create({ cardId: nubankCard.id, month: '2026-01', password: 'segredo' }, upload('fatura.csv', NUBANK_NOVEMBER));

            expect(parse).toHaveBeenCalledWith({ file: NUBANK_NOVEMBER, month: { year: 2026, month: 1 }, password: 'segredo' });
        });

        it('arquivo fora do formato do banco: 422 IMPORT_UNSUPPORTED_FORMAT com a versão do parser e o motivo no log', async () => {
            const c6Card = cards.seed({ bank: CardBank.C6 });
            const apply = spyApply();

            await expectAppError(service.create({ cardId: nubankCard.id, month: '2026-11' }, upload('fatura.csv', Buffer.from('Data;Valor\n'))), {
                code: 'IMPORT_UNSUPPORTED_FORMAT', statusCode: 422, reason: 'nubank-csv@1:csv_header_mismatch'
            });
            await expectAppError(
                service.create({ cardId: c6Card.id, month: '2026-11' }, upload('fatura.csv', c6Csv('31/02/2026;FULANO;1951;-;Loja;Única;0;0;10.00'))),
                { code: 'IMPORT_UNSUPPORTED_FORMAT', statusCode: 422, reason: 'c6-csv@1:c6_invalid_date_line_2' }
            );
            expect(apply).not.toHaveBeenCalled();
        });

        it('PDF protegido do Neon: sem senha ou com senha errada é 422; com a senha certa importa', async () => {
            const neonCard = cards.seed({ bank: CardBank.NEON });
            const pdf = buildNeonPdf([[NEON_HEADER, ['08/11', 'MERCADO', '-', 'Virtual - 0192', '-', '45,00']]], { password: '12345678900' });
            const file = upload('fatura-neon.pdf', pdf);

            await expectAppError(service.create({ cardId: neonCard.id, month: '2026-11' }, file), {
                code: 'IMPORT_FILE_PASSWORD_INVALID', statusCode: 422, reason: 'pdf_password_required'
            });
            await expectAppError(service.create({ cardId: neonCard.id, month: '2026-11', password: '1' }, file), {
                code: 'IMPORT_FILE_PASSWORD_INVALID', statusCode: 422, reason: 'pdf_password_incorrect'
            });

            const result = await service.create({ cardId: neonCard.id, month: '2026-11', password: '12345678900' }, file);

            expect(result).toMatchObject({
                import: { parserVersion: 'neon-pdf@1', rowCount: 1, ignoredCount: 0, expenseCount: 1 },
                summary: { created: 1 }
            });
            expect(imports.expensesOf(neonCard.id)).toEqual([
                expect.objectContaining({ originalDescription: 'MERCADO', amountCents: 4500n, cardLastDigits: '0192' })
            ]);
        });

        it('erro inesperado do parser passa como veio (vira 500, não um erro do usuário)', async () => {
            const failure = new Error('sem memória');
            jest.spyOn(nubank, 'parse').mockImplementation(() => {
                throw failure;
            });

            await expect(createNubank()).rejects.toBe(failure);
        });

        it('guarda no máximo 255 caracteres do nome do arquivo', async () => {
            const longName = `${'f'.repeat(300)}.csv`;

            const result = await service.create({ cardId: nubankCard.id, month: '2026-11' }, upload(longName, NUBANK_NOVEMBER));

            expect(result.import.fileName).toBe('f'.repeat(255));
        });
    });

    describe('create com as escolhas da pré-visualização (overrides)', () => {
        it('aplica apelido, categoria e pessoa à linha do mês e às parcelas projetadas', async () => {
            const casa = categories.seed({ name: 'Casa' });
            const ana = people.seed({ name: 'Ana' });

            await createNubank([{ key: LOJA_KEY, nickname: 'Geladeira', categoryId: casa.id, split: 'PERSONAL', personId: ana.id }]);

            const rows = imports.expensesOf(nubankCard.id);
            const loja = rows.filter(row => row.purchaseKey === LOJA_KEY);

            expect(loja).toHaveLength(5);
            for (const row of loja) {
                expect(row).toMatchObject({ nickname: 'Geladeira', categoryId: casa.id, personId: ana.id });
            }
            // Sem escolha, a compra nova fica pendente.
            expect(rows.find(row => row.purchaseKey === PADARIA_KEY)).toMatchObject({ nickname: null, categoryId: outros.id, split: 'PENDING', personId: null });
        });

        it('split PENDING ou SHARED na escolha: grava como veio, sem pessoa', async () => {
            await createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: outros.id, split: 'PENDING' },
                { key: PADARIA_KEY, nickname: null, categoryId: outros.id, split: 'SHARED' }
            ]);

            const rows = imports.expensesOf(nubankCard.id);

            expect(rows.filter(row => row.purchaseKey === LOJA_KEY).every(row => row.split === 'PENDING' && row.personId === null)).toBe(true);
            expect(rows.find(row => row.purchaseKey === PADARIA_KEY)).toMatchObject({ split: 'SHARED', personId: null });
        });

        it('key que não está no arquivo: a fatura mudou desde a pré-visualização (400), mesmo junto de keys válidas', async () => {
            const apply = spyApply();

            await expectAppError(createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: outros.id, split: 'SHARED', personId: null },
                { key: 'S|2026-10-21|1200|PADARIA', nickname: null, categoryId: outros.id, split: 'SHARED', personId: null }
            ]), { code: 'IMPORT_OVERRIDE_UNKNOWN_KEY', statusCode: 400, reason: 'override_key_not_in_file' });
            expect(apply).not.toHaveBeenCalled();
        });

        it('categoria inativa é 409 e inexistente é 404, conferindo todas as categorias escolhidas', async () => {
            const casa = categories.seed({ name: 'Casa' });
            const antiga = categories.seed({ name: 'Antiga', active: false });
            const apply = spyApply();

            await expectAppError(createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: casa.id, split: 'SHARED', personId: null },
                { key: PADARIA_KEY, nickname: null, categoryId: antiga.id, split: 'SHARED', personId: null }
            ]), { code: 'CARD_EXPENSE_INACTIVE_CATEGORY', statusCode: 409, reason: 'category_inactive' });
            await expectAppError(createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: MISSING_ID, split: 'SHARED', personId: null }
            ]), { code: 'CATEGORY_NOT_FOUND', statusCode: 404, reason: 'category_id_not_found' });
            expect(apply).not.toHaveBeenCalled();
        });

        it('pessoa inativa é 409 e inexistente é 404; compartilhada (SHARED) não consulta pessoas', async () => {
            const ana = people.seed({ name: 'Ana' });
            const bia = people.seed({ name: 'Bia', active: false });
            const apply = spyApply();
            const findPerson = jest.spyOn(people, 'findById');

            await expectAppError(createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: outros.id, split: 'PERSONAL', personId: ana.id },
                { key: PADARIA_KEY, nickname: null, categoryId: outros.id, split: 'PERSONAL', personId: bia.id }
            ]), { code: 'CARD_EXPENSE_INACTIVE_PERSON', statusCode: 409, reason: 'person_inactive' });
            await expectAppError(createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: outros.id, split: 'PERSONAL', personId: MISSING_ID }
            ]), { code: 'PERSON_NOT_FOUND', statusCode: 404, reason: 'person_id_not_found' });
            expect(apply).not.toHaveBeenCalled();

            findPerson.mockClear();
            await createNubank([{ key: LOJA_KEY, nickname: null, categoryId: outros.id, split: 'SHARED', personId: null }]);

            expect(findPerson).not.toHaveBeenCalled();
        });

        it('consulta cada categoria e cada pessoa uma vez só, mesmo repetidas em várias escolhas', async () => {
            const ana = people.seed({ name: 'Ana' });
            const findCategory = jest.spyOn(categories, 'findById');
            const findPerson = jest.spyOn(people, 'findById');

            await createNubank([
                { key: LOJA_KEY, nickname: null, categoryId: outros.id, split: 'PERSONAL', personId: ana.id },
                { key: PADARIA_KEY, nickname: null, categoryId: outros.id, split: 'PERSONAL', personId: ana.id }
            ]);

            expect(findCategory).toHaveBeenCalledTimes(1);
            expect(findPerson).toHaveBeenCalledTimes(1);
        });
    });

    describe('create com as decisões de exclusão (exclusions)', () => {
        it('compra à vista sempre usa o escopo do mês; parcelada mantém o escopo; remember só vale para excluir', async () => {
            const apply = spyApply();

            await createNubank(undefined, [
                { key: PADARIA_KEY, action: 'exclude', scope: 'all', remember: true },
                { key: LOJA_KEY, action: 'restore', scope: 'forward', remember: true }
            ]);
            await createNubank(undefined, [
                { key: LOJA_KEY, action: 'exclude', scope: 'backward', remember: false }
            ]);

            expect(apply.mock.calls[0][0].exclusions).toEqual([
                { purchaseKey: PADARIA_KEY, action: 'exclude', scope: 'month', remember: true },
                { purchaseKey: LOJA_KEY, action: 'restore', scope: 'forward', remember: false }
            ]);
            expect(apply.mock.calls[1][0].exclusions).toEqual([
                { purchaseKey: LOJA_KEY, action: 'exclude', scope: 'backward', remember: false }
            ]);
        });

        it('sem decisões, nada é excluído; com exclude, a linha do mês fica excluída', async () => {
            const apply = spyApply();

            await createNubank();

            expect(lastApplied(apply).exclusions).toEqual([]);
            expect(imports.expensesOf(nubankCard.id).every(row => row.excludedAt === null)).toBe(true);

            await createNubank(undefined, [{ key: PADARIA_KEY, action: 'exclude', scope: 'month', remember: true }]);

            const padaria = imports.expensesOf(nubankCard.id).find(row => row.purchaseKey === PADARIA_KEY);

            expect(padaria?.excludedAt).toBeInstanceOf(Date);
            expect(padaria?.exclusionRemembered).toBe(true);
        });

        it('key que não está no arquivo: 400, sem gravar nada', async () => {
            const apply = spyApply();

            await expectAppError(createNubank(undefined, [
                { key: PADARIA_KEY, action: 'exclude', scope: 'month', remember: false },
                { key: 'S|2026-01-01|1|SUMIU', action: 'exclude', scope: 'month', remember: false }
            ]), { code: 'IMPORT_OVERRIDE_UNKNOWN_KEY', statusCode: 400, reason: 'exclusion_key_not_in_file' });
            expect(apply).not.toHaveBeenCalled();
        });
    });

    describe('preview', () => {
        it('mostra o plano do arquivo sem gravar nada: compras novas e atualizadas, sugestões, removidas e resumo', async () => {
            const c6Card = cards.seed({ bank: CardBank.C6 });
            const transporte = categories.seed({ name: 'Transporte' });
            const ana = people.seed({ name: 'Ana' });
            const previous = imports.seedImport({ cardId: c6Card.id, month: NOVEMBER });
            const row = (purchaseKey: string, data: Partial<CardExpense> = {}): CardExpense =>
                imports.seedExpense({ cardId: c6Card.id, importId: previous.id, month: NOVEMBER, categoryId: outros.id, purchaseKey, ...data });
            const excludedAt = new Date('2026-11-15T10:00:00.000Z');

            row('S|2026-11-07|893|UBER', { nickname: 'Corrida', categoryId: transporte.id, personId: ana.id, excludedAt });
            // Compras do mês que não estão no arquivo, fora de ordem.
            const b = row('S|B', { transactionDate: new Date('2026-11-10T00:00:00.000Z'), originalDescription: 'B LOJA' });
            const z = row('S|Z', { transactionDate: new Date('2026-11-02T00:00:00.000Z'), originalDescription: 'Z LOJA', amountCents: 123456n });
            const a = row('S|A', { transactionDate: new Date('2026-11-10T00:00:00.000Z'), originalDescription: 'A LOJA' });
            const sameLater = row('S|M2', { id: 'f0000000-0000-4000-8000-000000000000', transactionDate: new Date('2026-11-12T00:00:00.000Z'), originalDescription: 'MESMA' });
            const sameFirst = row('S|M1', { id: '00000000-0000-4000-8000-000000000000', transactionDate: new Date('2026-11-12T00:00:00.000Z'), originalDescription: 'MESMA' });
            // Parcela futura de uma compra removida: sai junto, mas não aparece na lista do mês.
            row('S|Z', { month: DECEMBER, sourceMonth: NOVEMBER });
            const before = { imports: new Map(imports.imports), expenses: new Map(imports.expenses) };
            const apply = spyApply();

            const preview = await service.preview({ cardId: c6Card.id, month: '2026-11' }, upload('fatura-c6.csv', c6Csv(
                '30/09/2026;FULANO DE TAL;1951;Serviços;MP *LOJA;3/4;0;0;88.15',
                '07/11/2026;FULANA;4256;Transporte;UBER;Única;0;0;8.93',
                '01/11/2026;FULANO DE TAL;4165;-;Inclusao de Pagamento;Única;0;0;-4094.96'
            )));

            expect(preview).toMatchObject({ cardId: c6Card.id, month: '2026-11', fileName: 'fatura-c6.csv' });
            expect(preview.transactions).toEqual([
                {
                    key: 'P|2026-09|4|MP *LOJA',
                    status: 'new',
                    transactionDate: '2026-09-30',
                    description: 'MP *LOJA',
                    amount: '88.15',
                    installment: { number: 3, total: 4 },
                    holderName: 'FULANO DE TAL',
                    cardLastDigits: '1951',
                    nickname: null,
                    categoryId: outros.id,
                    split: 'PENDING',
                    personId: null,
                    projectedCount: 1,
                    excluded: false,
                    askExclusion: false
                },
                {
                    key: 'S|2026-11-07|893|UBER',
                    status: 'update',
                    transactionDate: '2026-11-07',
                    description: 'UBER',
                    amount: '8.93',
                    installment: null,
                    holderName: 'FULANA',
                    cardLastDigits: '4256',
                    nickname: 'Corrida',
                    categoryId: transporte.id,
                    split: 'PERSONAL',
                    personId: ana.id,
                    projectedCount: 0,
                    excluded: true,
                    askExclusion: true
                }
            ]);
            // Por data, depois descrição, depois id.
            expect(preview.removed.map(expense => expense.id)).toEqual([z.id, a.id, b.id, sameFirst.id, sameLater.id]);
            expect(preview.removed[0]).toEqual({
                id: z.id,
                cardId: c6Card.id,
                importId: previous.id,
                origin: 'UPLOAD',
                month: '2026-11',
                transactionDate: '2026-11-02',
                description: 'Z LOJA',
                originalDescription: 'Z LOJA',
                nickname: null,
                holderName: null,
                cardLastDigits: null,
                amount: '1234.56',
                installment: null,
                categoryId: outros.id,
                split: 'SHARED',
                personId: null,
                excluded: false,
                createdAt: z.createdAt,
                updatedAt: z.updatedAt
            });
            expect(preview.summary).toEqual({ created: 1, updated: 1, removed: 6, projected: 1, ignored: 1 });
            expect(apply).not.toHaveBeenCalled();
            expect(imports.imports).toEqual(before.imports);
            expect(imports.expenses).toEqual(before.expenses);
        });

        it('faz as mesmas validações do upload', async () => {
            const inactive = cards.seed({ active: false });

            await expectAppError(service.preview({ cardId: inactive.id, month: '2026-11' }, upload('fatura.csv', NUBANK_NOVEMBER)), {
                code: 'CREDIT_CARD_INACTIVE', statusCode: 409, reason: 'credit_card_inactive'
            });
            await expectAppError(service.preview({ cardId: nubankCard.id, month: '2026-11' }, upload('fatura.pdf', NUBANK_NOVEMBER)), {
                code: 'IMPORT_INVALID_FILE_TYPE', statusCode: 400, reason: 'expected_csv_for_nubank'
            });
        });
    });

    describe('histórico (findAll, findById, delete)', () => {
        it('findAll filtra por cartão e mês e devolve só os campos públicos, mais recentes primeiro', async () => {
            const other = cards.seed({ bank: CardBank.C6 });
            const old = imports.seedImport({ cardId: nubankCard.id, month: NOVEMBER, createdAt: new Date('2026-11-01T10:00:00.000Z') });
            const recent = imports.seedImport({ cardId: nubankCard.id, month: DECEMBER, createdAt: new Date('2026-12-01T10:00:00.000Z') });
            const fromOther = imports.seedImport({ cardId: other.id, month: NOVEMBER, createdAt: new Date('2026-11-05T10:00:00.000Z') });
            imports.seedExpense({ cardId: nubankCard.id, importId: old.id, month: NOVEMBER, purchaseKey: 'S|X', categoryId: outros.id });
            const findAll = jest.spyOn(imports, 'findAll');

            const all = await service.findAll({});
            const byCard = await service.findAll({ cardId: nubankCard.id });
            const byCardAndMonth = await service.findAll({ cardId: nubankCard.id, month: '2026-11' });

            expect(all.map(item => item.id)).toEqual([recent.id, fromOther.id, old.id]);
            expect(byCard.map(item => item.id)).toEqual([recent.id, old.id]);
            expect(byCardAndMonth).toEqual([{
                id: old.id,
                cardId: nubankCard.id,
                month: '2026-11',
                fileName: old.fileName,
                parserVersion: old.parserVersion,
                rowCount: old.rowCount,
                ignoredCount: old.ignoredCount,
                expenseCount: 1,
                createdAt: old.createdAt
            }]);
            expect(findAll).toHaveBeenNthCalledWith(1, { cardId: undefined, month: undefined });
            expect(findAll).toHaveBeenNthCalledWith(3, { cardId: nubankCard.id, month: NOVEMBER });
        });

        it('findById devolve o upload; id inexistente é 404 CARD_IMPORT_NOT_FOUND', async () => {
            const cardImport = imports.seedImport({ cardId: nubankCard.id, month: NOVEMBER });

            await expect(service.findById(cardImport.id)).resolves.toMatchObject({ id: cardImport.id, month: '2026-11', expenseCount: 0 });
            await expectAppError(service.findById(MISSING_ID), {
                code: 'CARD_IMPORT_NOT_FOUND', statusCode: 404, reason: 'card_import_id_not_found'
            });
        });

        it('delete apaga o upload e as despesas que ele gravou; id inexistente é 404 sem tentar apagar', async () => {
            const { import: created } = await createNubank();
            const remove = jest.spyOn(imports, 'delete');

            await service.delete(created.id);

            expect(imports.imports.size).toBe(0);
            expect(imports.expensesOf(nubankCard.id)).toEqual([]);

            remove.mockClear();
            await expectAppError(service.delete(created.id), {
                code: 'CARD_IMPORT_NOT_FOUND', statusCode: 404, reason: 'card_import_id_not_found'
            });
            expect(remove).not.toHaveBeenCalled();
        });
    });
});
