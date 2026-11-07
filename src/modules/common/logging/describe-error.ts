export type ErrorDescription = {
    readonly errorName: string;
    readonly errorMessage: string;
    readonly stack?: string;
};

/** Campos padronizados para registrar qualquer valor lançado (Error ou não). */
export function describeError(error: unknown): ErrorDescription {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            ...(error.stack ? { stack: error.stack } : {})
        };
    }

    return { errorName: 'Erro', errorMessage: typeof error === 'string' ? error : JSON.stringify(error) ?? String(error) };
}
