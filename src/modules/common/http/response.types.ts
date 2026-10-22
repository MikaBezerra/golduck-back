export interface ApiSuccessResponse<T> {
    readonly data: T;
}

export interface ApiErrorDetail {
    readonly field: string;
    readonly code: string;
    readonly message: string;
}

export interface ApiErrorResponse {
    readonly error: {
        readonly code: string;
        readonly message: string;
        readonly requestId: string;
        readonly details?: ApiErrorDetail[];
    };
}
