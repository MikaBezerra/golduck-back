export class AppError extends Error {
    public constructor(
        public readonly code: string,
        public readonly statusCode: number,
        public readonly publicMessage: string,
        public readonly reason?: string
    ) {
        super(publicMessage);
        this.name = 'AppError';
    }
}
