/*
 * Acesso à API da Pluggy (Meu Pluggy), atrás de uma interface: o service não sabe se é a API de
 * verdade ou um falso de teste. Só os campos que o Golduck usa estão tipados.
 */

/** Item = a conexão de um banco no Meu Pluggy. */
export type PluggyItem = {
    id: string;
    /** UPDATED, UPDATING, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT. */
    status: string;
    executionStatus?: string | null;
    /** Última atualização dos dados (o Meu Pluggy atualiza 1 vez por dia). */
    lastUpdatedAt?: string | null;
    /** Fim da autorização do Open Finance. */
    consentExpiresAt?: string | null;
    error?: { code: string; message: string } | null;
};

export type PluggyAccount = {
    id: string;
    /** BANK ou CREDIT. */
    type: string;
    subtype?: string | null;
    name?: string | null;
    number?: string | null;
};

export type PluggyCreditCardMetadata = {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    /** Data da compra original (nas parcelas). */
    purchaseDate?: string | null;
    cardNumber?: string | null;
    /** Fatura da compra; só aparece depois que a fatura vence. */
    billId?: string | null;
};

export type PluggyTransaction = {
    id: string;
    description: string;
    /** Valor na moeda da compra; positivo = compra no cartão. */
    amount: number;
    /** Valor em reais quando a compra foi em outra moeda. */
    amountInAccountCurrency?: number | null;
    currencyCode?: string | null;
    /** Data e hora do lançamento (UTC). */
    date: string;
    status?: string | null;
    type?: string | null;
    /** PAGAMENTO, PAGAMENTO_FATURA, ESTORNO, TARIFA, OUTROS... */
    operationType?: string | null;
    creditCardMetadata?: PluggyCreditCardMetadata | null;
};

/** Fatura já fechada (a aberta não vem). */
export type PluggyBill = {
    id: string;
    /** "2026-11-01T00:00:00" */
    dueDate: string;
    /** Último dia de compra da fatura. */
    billClosingDate?: string | null;
    totalAmount?: number | null;
};

/** Falha de uma chamada à Pluggy (status HTTP 0 = sem resposta: rede ou tempo esgotado). */
export class PluggyRequestError extends Error {
    public constructor(
        public readonly status: number,
        /** codeDescription da Pluggy (CLIENT_KEYS_UNAUTHORIZED...) ou o motivo da falha de rede. */
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'PluggyRequestError';
    }
}

export abstract class PluggyClient {
    /** Credenciais configuradas neste ambiente (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET). */
    public abstract readonly enabled: boolean;

    public abstract getItem(itemId: string): Promise<PluggyItem>;

    public abstract listAccounts(itemId: string): Promise<PluggyAccount[]>;

    /** Todas as transações da conta desde dateFrom (AAAA-MM-DD), página por página. */
    public abstract listTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]>;

    /** Todas as faturas fechadas da conta. */
    public abstract listBills(accountId: string): Promise<PluggyBill[]>;
}
