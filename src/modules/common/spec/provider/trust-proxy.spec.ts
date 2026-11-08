import { fastifyTrustProxy, parseTrustProxy } from '../../provider/trust-proxy.js';

const INVALID = 'TRUST_PROXY must be true, false, a number of hops or a list of IPs/CIDRs:';

/** TRUST_PROXY decide em quais proxies confiar para achar o IP real do cliente. */
describe('parseTrustProxy', () => {
    it('ausente, vazio, só espaços ou "false": não confia em proxy', () => {
        for (const value of [undefined, '', '   ', 'false', ' false ']) {
            expect(parseTrustProxy(value)).toBe(false);
        }
    });

    it('"true": confia em todos', () => {
        expect(parseTrustProxy('true')).toBe(true);
        expect(parseTrustProxy('  true ')).toBe(true);
    });

    it('número: quantidade de proxies à frente da API', () => {
        expect(parseTrustProxy('0')).toBe(0);
        expect(parseTrustProxy('1')).toBe(1);
        expect(parseTrustProxy(' 12 ')).toBe(12);
    });

    it('lista de IPs e CIDRs (IPv4 e IPv6), sem espaços nem itens vazios', () => {
        expect(parseTrustProxy('10.0.0.1')).toBe('10.0.0.1');
        expect(parseTrustProxy(' 10.0.0.0/8 , 192.168.0.1,, ::1, fd00::/64 ')).toBe('10.0.0.0/8,192.168.0.1,::1,fd00::/64');
        expect(parseTrustProxy('10.0.0.0/0,10.0.0.0/128')).toBe('10.0.0.0/0,10.0.0.0/128');
    });

    it('recusa o que não é IP, apontando o item inválido', () => {
        expect(() => parseTrustProxy('TRUE')).toThrow(`${INVALID} TRUE`);
        expect(() => parseTrustProxy('10.0.0.1, proxy.local')).toThrow(`${INVALID} proxy.local`);
        expect(() => parseTrustProxy('1.5')).toThrow(`${INVALID} 1.5`);
        expect(() => parseTrustProxy('12a')).toThrow(`${INVALID} 12a`);
        expect(() => parseTrustProxy('a12')).toThrow(`${INVALID} a12`);
        expect(() => parseTrustProxy('-1')).toThrow(`${INVALID} -1`);
    });

    it('recusa prefixo de CIDR que não seja número de 1 a 3 dígitos', () => {
        for (const entry of ['10.0.0.0/', '10.0.0.0/abc', '10.0.0.0/1234', '10.0.0.0/8a', '10.0.0.0/a8']) {
            expect(() => parseTrustProxy(entry)).toThrow(`${INVALID} ${entry}`);
        }
    });

    it('só vírgulas: lista vazia também é inválida', () => {
        expect(() => parseTrustProxy(', ,')).toThrow(`${INVALID} , ,`);
    });
});

describe('fastifyTrustProxy', () => {
    it('repassa booleano e lista como vieram', () => {
        expect(fastifyTrustProxy(undefined)).toBe(false);
        expect(fastifyTrustProxy('true')).toBe(true);
        expect(fastifyTrustProxy('10.0.0.0/8, ::1')).toBe('10.0.0.0/8,::1');
    });

    it('número de saltos vira função: confia nos N primeiros proxies', () => {
        const trustTwo = fastifyTrustProxy('2');
        const trustNone = fastifyTrustProxy('0');

        if (typeof trustTwo !== 'function' || typeof trustNone !== 'function') {
            throw new Error('esperava uma função');
        }

        expect([0, 1, 2, 3].map(hop => trustTwo('10.0.0.1', hop))).toEqual([true, true, false, false]);
        expect(trustNone('10.0.0.1', 0)).toBe(false);
    });

    it('valor inválido também lança erro', () => {
        expect(() => fastifyTrustProxy('qualquer')).toThrow(`${INVALID} qualquer`);
    });
});
