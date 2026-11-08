import type { Config } from '../../common/index.js';

import { HttpPluggyClient } from '../pluggy/http-pluggy-client.js';
import { PluggyRequestError } from '../pluggy/pluggy-client.js';
import { createPluggyClient, DisabledPluggyClient } from '../pluggy/pluggy-client.provider.js';

const CREDENTIALS = { baseUrl: 'https://pluggy.test', clientId: 'client-id', clientSecret: 'client-secret' };

type Call = { url: string; method: string; apiKey: string | null; body: string | null };

/** fetch falso: responde por rota, na ordem, e guarda as chamadas. */
function fakeFetch(routes: Record<string, Array<{ status: number; body?: unknown } | Error>>) {
    const calls: Call[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        await Promise.resolve();

        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const headers = new Headers(init?.headers);
        const path = url.replace(CREDENTIALS.baseUrl, '').split('?')[0];

        calls.push({ url, method: init?.method ?? 'GET', apiKey: headers.get('X-API-KEY'), body: typeof init?.body === 'string' ? init.body : null });

        const next = routes[path]?.shift();

        if (!next) {
            throw new Error(`rota sem resposta: ${path}`);
        }

        if (next instanceof Error) {
            throw next;
        }

        return new Response(next.body === undefined ? 'sem json' : JSON.stringify(next.body), { status: next.status });
    }) as typeof fetch;

    return { calls, fetchFn };
}

const auth = (apiKey = 'chave-1') => ({ status: 200, body: { apiKey } });

/** Cliente HTTP da Pluggy contra um fetch falso: autenticação, paginação e erros. */
describe('HttpPluggyClient', () => {
    it('autentica uma vez e reaproveita a chave até ela vencer', async () => {
        let now = 0;
        const { calls, fetchFn } = fakeFetch({
            '/auth': [auth('chave-1'), auth('chave-2')],
            '/items/item-1': [{ status: 200, body: { id: 'item-1', status: 'UPDATED' } }, { status: 200, body: { id: 'item-1', status: 'UPDATED' } }],
            '/accounts': [{ status: 200, body: { results: [{ id: 'conta', type: 'CREDIT' }] } }]
        });
        const client = new HttpPluggyClient(CREDENTIALS, fetchFn, () => now);

        await expect(client.getItem('item-1')).resolves.toEqual({ id: 'item-1', status: 'UPDATED' });
        await expect(client.listAccounts('item-1')).resolves.toEqual([{ id: 'conta', type: 'CREDIT' }]);
        now = 101 * 60 * 1000;
        await client.getItem('item-1');

        expect(calls.map(call => [call.method, call.url.replace(CREDENTIALS.baseUrl, ''), call.apiKey])).toEqual([
            ['POST', '/auth', null],
            ['GET', '/items/item-1', 'chave-1'],
            ['GET', '/accounts?itemId=item-1', 'chave-1'],
            ['POST', '/auth', null],
            ['GET', '/items/item-1', 'chave-2']
        ]);
        expect(JSON.parse(calls[0].body as string)).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
    });

    it('transações: segue o cursor "next" até acabar', async () => {
        const { calls, fetchFn } = fakeFetch({
            '/auth': [auth()],
            '/v2/transactions': [
                { status: 200, body: { results: [{ id: 't1' }], next: '?accountId=conta&after=abc' } },
                { status: 200, body: { results: [{ id: 't2' }], next: null } }
            ]
        });

        const transactions = await new HttpPluggyClient(CREDENTIALS, fetchFn).listTransactions('conta', '2025-10-01');

        expect(transactions.map(transaction => transaction.id)).toEqual(['t1', 't2']);
        expect(calls.slice(1).map(call => call.url.replace(CREDENTIALS.baseUrl, ''))).toEqual([
            '/v2/transactions?accountId=conta&dateFrom=2025-10-01',
            '/v2/transactions?accountId=conta&after=abc'
        ]);
    });

    it('faturas: página por página até totalPages', async () => {
        const { calls, fetchFn } = fakeFetch({
            '/auth': [auth()],
            '/bills': [
                { status: 200, body: { results: [{ id: 'f1' }], page: 1, totalPages: 2 } },
                { status: 200, body: { results: [{ id: 'f2' }], page: 2, totalPages: 2 } }
            ]
        });

        const bills = await new HttpPluggyClient(CREDENTIALS, fetchFn).listBills('conta');

        expect(bills.map(bill => bill.id)).toEqual(['f1', 'f2']);
        expect(calls.slice(1).map(call => call.url.replace(CREDENTIALS.baseUrl, ''))).toEqual(['/bills?accountId=conta&page=1', '/bills?accountId=conta&page=2']);
    });

    it('faturas sem totalPages: só uma página', async () => {
        const { fetchFn } = fakeFetch({ '/auth': [auth()], '/bills': [{ status: 200, body: { results: [] } }] });

        await expect(new HttpPluggyClient(CREDENTIALS, fetchFn).listBills('conta')).resolves.toEqual([]);
    });

    it('401 numa consulta: pede outra chave e tenta de novo uma vez', async () => {
        const { calls, fetchFn } = fakeFetch({
            '/auth': [auth('vencida'), auth('nova')],
            '/items/item-1': [{ status: 401, body: { message: 'expired' } }, { status: 200, body: { id: 'item-1', status: 'UPDATED' } }]
        });

        await new HttpPluggyClient(CREDENTIALS, fetchFn).getItem('item-1');

        expect(calls.map(call => call.apiKey)).toEqual([null, 'vencida', null, 'nova']);
    });

    it('erro da Pluggy vira PluggyRequestError com status, codeDescription e mensagem', async () => {
        const { fetchFn } = fakeFetch({
            '/auth': [{ status: 401, body: { message: 'client keys are invalid', code: 401, codeDescription: 'CLIENT_KEYS_UNAUTHORIZED' } }]
        });

        await expect(new HttpPluggyClient(CREDENTIALS, fetchFn).getItem('item-1')).rejects.toEqual(
            new PluggyRequestError(401, 'CLIENT_KEYS_UNAUTHORIZED', 'client keys are invalid')
        );
    });

    it('erro sem corpo JSON e falha de rede também viram PluggyRequestError', async () => {
        const { fetchFn } = fakeFetch({
            '/auth': [auth()],
            '/items/a': [{ status: 500 }],
            '/items/b': [Object.assign(new Error('tempo esgotado'), { name: 'TimeoutError' })]
        });
        const client = new HttpPluggyClient(CREDENTIALS, fetchFn);

        await expect(client.getItem('a')).rejects.toMatchObject({ status: 500, code: 'HTTP_500', message: 'Pluggy respondeu 500' });
        await expect(client.getItem('b')).rejects.toMatchObject({ status: 0, code: 'TimeoutError', message: 'Pluggy não respondeu (TimeoutError)' });
    });

    it('falha de rede sem Error: motivo "unknown"', async () => {
        const fetchFn = (async () => Promise.reject(new Error('x'))) as unknown as typeof fetch;
        // Há bibliotecas que rejeitam com algo que não é Error: o motivo vira "unknown".
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        const throwing = (async () => Promise.reject('texto')) as unknown as typeof fetch;

        await expect(new HttpPluggyClient(CREDENTIALS, fetchFn).getItem('a')).rejects.toMatchObject({ code: 'Error' });
        await expect(new HttpPluggyClient(CREDENTIALS, throwing).getItem('a')).rejects.toMatchObject({ code: 'unknown' });
    });
});

describe('createPluggyClient', () => {
    it('sem Client ID ou Client Secret: cliente desligado, que responde 503 PLUGGY_DISABLED', async () => {
        const client = createPluggyClient({ PLUGGY_API_URL: 'https://api.pluggy.ai', PLUGGY_CLIENT_ID: 'id' } as Config);
        const disabled = { code: 'PLUGGY_DISABLED', statusCode: 503, reason: 'pluggy_credentials_missing' };

        expect(client).toBeInstanceOf(DisabledPluggyClient);
        expect(client.enabled).toBe(false);
        await expect(client.getItem('item')).rejects.toMatchObject(disabled);
        await expect(client.listAccounts('item')).rejects.toMatchObject(disabled);
        await expect(client.listTransactions('conta', '2026-01-01')).rejects.toMatchObject(disabled);
        await expect(client.listBills('conta')).rejects.toMatchObject(disabled);
    });

    it('com as duas credenciais: cliente HTTP', () => {
        const client = createPluggyClient({ PLUGGY_API_URL: 'https://api.pluggy.ai', PLUGGY_CLIENT_ID: 'id', PLUGGY_CLIENT_SECRET: 'segredo' } as Config);

        expect(client).toBeInstanceOf(HttpPluggyClient);
        expect(client.enabled).toBe(true);
    });
});
