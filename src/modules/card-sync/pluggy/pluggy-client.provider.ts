import type { Config } from '../../common/index.js';

import { Service } from '../../tokens.js';
import { CARD_SYNC_ERRORS } from '../errors/card-sync.errors.js';
import { HttpPluggyClient } from './http-pluggy-client.js';
import { PluggyClient } from './pluggy-client.js';

/** Sem PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET: a sincronização responde 503 PLUGGY_DISABLED. */
export class DisabledPluggyClient extends PluggyClient {
    public readonly enabled = false;

    public async getItem(): Promise<never> {
        return Promise.reject(CARD_SYNC_ERRORS.pluggyDisabled('pluggy_credentials_missing'));
    }

    public async listAccounts(): Promise<never> {
        return Promise.reject(CARD_SYNC_ERRORS.pluggyDisabled('pluggy_credentials_missing'));
    }

    public async listTransactions(): Promise<never> {
        return Promise.reject(CARD_SYNC_ERRORS.pluggyDisabled('pluggy_credentials_missing'));
    }

    public async listBills(): Promise<never> {
        return Promise.reject(CARD_SYNC_ERRORS.pluggyDisabled('pluggy_credentials_missing'));
    }
}

export function createPluggyClient(config: Config): PluggyClient {
    if (!config.PLUGGY_CLIENT_ID || !config.PLUGGY_CLIENT_SECRET) {
        return new DisabledPluggyClient();
    }

    return new HttpPluggyClient({
        baseUrl: config.PLUGGY_API_URL,
        clientId: config.PLUGGY_CLIENT_ID,
        clientSecret: config.PLUGGY_CLIENT_SECRET
    });
}

export const pluggyClientProvider = {
    provide: PluggyClient,
    inject: [Service.CONFIG],
    useFactory: createPluggyClient
};
