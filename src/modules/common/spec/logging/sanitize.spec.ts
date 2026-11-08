import { REDACTED, sanitizeForLog, truncateText } from '../../logging/sanitize.js';

/*
 * O que vem de fora (corpo, query, detalhes de validação) passa por aqui antes de ir para o log:
 * nada de senha, token ou cookie, e nada de textos e listas gigantes.
 */
describe('sanitizeForLog', () => {

    describe('campos sensíveis', () => {
        it('oculta senha, token, segredo, authorization, cookie, api key e credencial', () => {
            const sanitized = sanitizeForLog({
                pass: 'a',
                password: 'b',
                newPassword: 'c',
                senha: 'd',
                senhaAtual: 'e',
                token: 'f',
                refreshToken: 'g',
                secret: 'h',
                clientSecret: 'i',
                authorization: 'Bearer x',
                cookie: 'sessao=1',
                'set-cookie': 'sessao=2',
                apikey: 'j',
                'api-key': 'k',
                api_key: 'l',
                credential: 'm',
                credentials: { user: 'n' }
            });

            expect(sanitized).toEqual({
                pass: REDACTED,
                password: REDACTED,
                newPassword: REDACTED,
                senha: REDACTED,
                senhaAtual: REDACTED,
                token: REDACTED,
                refreshToken: REDACTED,
                secret: REDACTED,
                clientSecret: REDACTED,
                authorization: REDACTED,
                cookie: REDACTED,
                'set-cookie': REDACTED,
                apikey: REDACTED,
                'api-key': REDACTED,
                api_key: REDACTED,
                credential: REDACTED,
                credentials: REDACTED
            });
            expect(REDACTED).toBe('[oculto]');
        });

        it('não diferencia maiúsculas no nome do campo', () => {
            expect(sanitizeForLog({ Authorization: 'Bearer x', PASSWORD: '1', SENHA: '2', ApiKey: '3', Cookie: '4' })).toEqual({
                Authorization: REDACTED, PASSWORD: REDACTED, SENHA: REDACTED, ApiKey: REDACTED, Cookie: REDACTED
            });
        });

        it('mantém os demais campos e oculta também dentro de objetos e listas aninhados', () => {
            const sanitized = sanitizeForLog({
                email: 'pessoa@exemplo.com',
                amount: '12.50',
                api: 'v1',
                key: 'mes',
                items: [{ name: 'Mercado', token: 'x' }],
                nested: { auth: { password: 'y', user: 'z' } }
            });

            expect(sanitized).toEqual({
                email: 'pessoa@exemplo.com',
                amount: '12.50',
                api: 'v1',
                key: 'mes',
                items: [{ name: 'Mercado', token: REDACTED }],
                nested: { auth: { password: REDACTED, user: 'z' } }
            });
        });
    });

    describe('tipos de valor', () => {
        it('devolve como vieram null, undefined, números e booleanos', () => {
            expect(sanitizeForLog(null)).toBeNull();
            expect(sanitizeForLog(undefined)).toBeUndefined();
            expect(sanitizeForLog(0)).toBe(0);
            expect(sanitizeForLog(12.5)).toBe(12.5);
            expect(sanitizeForLog(true)).toBe(true);
            expect(sanitizeForLog(false)).toBe(false);
            expect(sanitizeForLog({ a: null, b: undefined, c: 1, d: false })).toEqual({ a: null, b: undefined, c: 1, d: false });
        });

        it('converte bigint em texto, data em ISO e buffer em resumo de tamanho', () => {
            expect(sanitizeForLog({
                cents: 123456n,
                at: new Date('2026-11-07T13:15:05.000Z'),
                file: Buffer.from('conteúdo do arquivo')
            })).toEqual({
                cents: '123456',
                at: '2026-11-07T13:15:05.000Z',
                file: `[binário: ${Buffer.byteLength('conteúdo do arquivo')} bytes]`
            });
        });

        it('troca função e símbolo pelo nome do tipo', () => {
            expect(sanitizeForLog({ fn: () => 1, sym: Symbol('x') })).toEqual({ fn: '[function]', sym: '[symbol]' });
        });
    });

    describe('tamanhos', () => {
        it('textos até 500 caracteres passam inteiros; acima disso são encurtados', () => {
            const limit = 'a'.repeat(500);
            const tooLong = 'b'.repeat(501);

            expect(sanitizeForLog({ limit, tooLong })).toEqual({
                limit,
                tooLong: `${'b'.repeat(500)}… (+1)`
            });
        });

        it('listas até 50 itens passam inteiras; acima disso ficam 50 e um aviso do que sobrou', () => {
            const fifty = Array.from({ length: 50 }, (_, index) => index);
            const fiftyTwo = Array.from({ length: 52 }, (_, index) => index);

            expect(sanitizeForLog(fifty)).toEqual(fifty);
            expect(sanitizeForLog(fiftyTwo)).toEqual([...fifty, '… (+2 itens)']);
        });

        it('objetos com mais de 6 níveis viram "[…]", mas valores simples no 6º nível ficam', () => {
            const deep = { a: { b: { c: { d: { e: { f: { g: 1 }, text: 'fica', list: [1] } } } } } };

            expect(sanitizeForLog(deep)).toEqual({ a: { b: { c: { d: { e: { f: '[…]', text: 'fica', list: '[…]' } } } } } });
        });

        it('listas também contam nível', () => {
            const deep = [[[[[[['fundo']]]]]]];

            expect(sanitizeForLog(deep)).toEqual([[[[[['[…]']]]]]]);
        });

        it('aceita até 4096 caracteres de JSON; acima disso registra só o começo, com o tamanho total', () => {
            // 8 textos de 500 (502 cada com aspas) + vírgulas + colchetes = 4025; o último completa o total.
            const exact = [...Array.from({ length: 8 }, () => 'x'.repeat(500)), 'y'.repeat(68)];
            const over = [...Array.from({ length: 8 }, () => 'x'.repeat(500)), 'y'.repeat(69)];
            const overJson = JSON.stringify(over);

            expect(JSON.stringify(exact)).toHaveLength(4096);
            expect(sanitizeForLog(exact)).toEqual(exact);
            expect(overJson).toHaveLength(4097);
            expect(sanitizeForLog(over)).toEqual({
                truncated: true,
                size: 4097,
                preview: `${overJson.slice(0, 4096)}…`
            });
        });
    });
});

describe('truncateText', () => {
    it('não mexe em texto até o limite', () => {
        expect(truncateText('abc', 3)).toBe('abc');
        expect(truncateText('a'.repeat(500))).toBe('a'.repeat(500));
    });

    it('acima do limite corta e diz quantos caracteres ficaram de fora', () => {
        expect(truncateText('abcdef', 4)).toBe('abcd… (+2)');
        expect(truncateText('a'.repeat(503))).toBe(`${'a'.repeat(500)}… (+3)`);
    });
});
