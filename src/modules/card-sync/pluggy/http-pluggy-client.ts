import {
    PluggyAccount,
    PluggyBill,
    PluggyClient,
    PluggyItem,
    PluggyRequestError,
    PluggyTransaction
} from './pluggy-client.js';

export type PluggyCredentials = {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
};

type FetchFunction = typeof fetch;

/** A chave da API vale 2 horas; renovamos antes, com folga. */
const API_KEY_TTL_MS = 100 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
/** Proteção contra paginação sem fim (500 transações por página). */
const MAX_PAGES = 50;

type Page<T> = { results: T[]; page?: number; totalPages?: number };
type CursorPage<T> = { results: T[]; next?: string | null };
type ErrorBody = { message?: string; codeDescription?: string };

/** Cliente da API REST da Pluggy (https://api.pluggy.ai). */
export class HttpPluggyClient extends PluggyClient {
    public readonly enabled = true;
    private apiKey: { value: string; expiresAt: number } | null = null;

    public constructor(
        private readonly credentials: PluggyCredentials,
        private readonly fetchFn: FetchFunction = fetch,
        private readonly now: () => number = Date.now
    ) {
        super();
    }

    public async getItem(itemId: string): Promise<PluggyItem> {
        return this.get<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);
    }

    public async listAccounts(itemId: string): Promise<PluggyAccount[]> {
        return (await this.get<Page<PluggyAccount>>(`/accounts?itemId=${encodeURIComponent(itemId)}`)).results;
    }

    public async listTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
        const transactions: PluggyTransaction[] = [];
        // "next" já vem pronto: é a query string inteira da próxima página.
        let query: string | null = `?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;

        for (let page = 0; query && page < MAX_PAGES; page++) {
            const response: CursorPage<PluggyTransaction> = await this.get(`/v2/transactions${query}`);

            transactions.push(...response.results);
            query = response.next ?? null;
        }

        return transactions;
    }

    public async listBills(accountId: string): Promise<PluggyBill[]> {
        const bills: PluggyBill[] = [];

        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await this.get<Page<PluggyBill>>(`/bills?accountId=${encodeURIComponent(accountId)}&page=${page}`);

            bills.push(...response.results);

            if (page >= (response.totalPages ?? 1)) {
                break;
            }
        }

        return bills;
    }

    private async get<T>(path: string): Promise<T> {
        const response = await this.request(path, { headers: { 'X-API-KEY': await this.getApiKey() } });

        if (response.status === 401 || response.status === 403) {
            // Chave vencida antes da hora: pede outra uma vez.
            this.apiKey = null;

            return this.parse<T>(await this.request(path, { headers: { 'X-API-KEY': await this.getApiKey() } }));
        }

        return this.parse<T>(response);
    }

    private async getApiKey(): Promise<string> {
        if (this.apiKey && this.apiKey.expiresAt > this.now()) {
            return this.apiKey.value;
        }

        const response = await this.request('/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: this.credentials.clientId, clientSecret: this.credentials.clientSecret })
        });
        const { apiKey } = await this.parse<{ apiKey: string }>(response);

        this.apiKey = { value: apiKey, expiresAt: this.now() + API_KEY_TTL_MS };

        return apiKey;
    }

    private async request(path: string, init: RequestInit): Promise<Response> {
        try {
            return await this.fetchFn(`${this.credentials.baseUrl}${path}`, {
                ...init,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.name : 'unknown';

            throw new PluggyRequestError(0, reason, `Pluggy não respondeu (${reason})`);
        }
    }

    private async parse<T>(response: Response): Promise<T> {
        if (response.ok) {
            return await response.json() as T;
        }

        const body = await response.json().catch(() => ({})) as ErrorBody;

        throw new PluggyRequestError(
            response.status,
            body.codeDescription ?? `HTTP_${response.status}`,
            body.message ?? `Pluggy respondeu ${response.status}`
        );
    }
}
