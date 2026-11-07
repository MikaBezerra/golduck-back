import { APP_VERSION_HEADER, generateRequestId, REQUEST_ID_HEADER } from '../../logging/request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const withHeader = (value: string | string[] | undefined): { headers: Record<string, string | string[] | undefined> } => ({
    headers: { [REQUEST_ID_HEADER]: value }
});

/** O id de cada requisição: o do front quando é seguro reaproveitar, senão um UUID novo. */
describe('generateRequestId', () => {
    it('usa os nomes de header combinados com o front', () => {
        expect(REQUEST_ID_HEADER).toBe('x-request-id');
        expect(APP_VERSION_HEADER).toBe('x-app-version');
    });

    it('reaproveita o x-request-id válido enviado pelo cliente', () => {
        expect(generateRequestId(withHeader('3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f'))).toBe('3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f');
        expect(generateRequestId(withHeader('Ab3._-xyZ'))).toBe('Ab3._-xyZ');
    });

    it('aceita de 8 a 128 caracteres', () => {
        expect(generateRequestId(withHeader('a'.repeat(8)))).toBe('a'.repeat(8));
        expect(generateRequestId(withHeader('9'.repeat(128)))).toBe('9'.repeat(128));
        expect(generateRequestId(withHeader('a'.repeat(7)))).toMatch(UUID);
        expect(generateRequestId(withHeader('a'.repeat(129)))).toMatch(UUID);
    });

    it('troca por um UUID o id com espaço, quebra de linha ou outros caracteres, mesmo só no começo ou no fim', () => {
        for (const invalid of ['abc defgh', 'abcdefgh\nfalso log', '!abcdefgh', 'abcdefgh!', 'abcdefgh/', 'çabcdefgh']) {
            expect(generateRequestId(withHeader(invalid))).toMatch(UUID);
        }
    });

    it('sem header (ou com o header repetido) gera um UUID novo a cada requisição', () => {
        const first = generateRequestId(withHeader(undefined));
        const second = generateRequestId({ headers: {} });

        expect(first).toMatch(UUID);
        expect(second).toMatch(UUID);
        expect(first).not.toBe(second);
        expect(generateRequestId(withHeader(['abcdefgh1', 'abcdefgh2']))).toMatch(UUID);
    });
});
