export class AppError extends Error {
    public constructor(
        public readonly code: string,
        public readonly statusCode: number,
        public readonly publicMessage: string,
        public readonly reason?: string,
        /** Headers extras da resposta de erro (ex.: Retry-After num 429). */
        public readonly headers: Readonly<Record<string, string>> = {}
    ) {
        super(publicMessage);
        this.name = 'AppError';
    }
}
