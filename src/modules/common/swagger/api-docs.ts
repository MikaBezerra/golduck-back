import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import {
    ApiDefaultResponse,
    ApiExtraModels,
    ApiProperty,
    ApiPropertyOptional,
    ApiResponse,
    getSchemaPath
} from '@nestjs/swagger';

/*
 * Peças comuns da documentação OpenAPI (Swagger):
 * - o envelope { data } de toda resposta de sucesso com conteúdo;
 * - o formato { error } das respostas de erro (ApiExceptionFilter);
 * - exemplos e padrões reutilizados (dinheiro, mês, UUID).
 */

export const MONEY_EXAMPLE = '1234.56';
export const MONTH_PATTERN = '^[1-9]\\d{3}-(0[1-9]|1[0-2])$';
export const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

/** Valor em reais como texto, com ponto decimal. */
export const MONEY_PROPERTY = {
    type: String,
    example: MONEY_EXAMPLE,
    description: 'Valor em reais, como texto com ponto decimal'
} as const;

export const MONTH_PROPERTY = {
    type: String,
    example: '2026-11',
    pattern: MONTH_PATTERN,
    description: 'Mês no formato AAAA-MM'
} as const;

export const UUID_PROPERTY = {
    type: String,
    format: 'uuid'
} as const;

export const DATE_TIME_PROPERTY = {
    type: String,
    format: 'date-time'
} as const;

export class ApiErrorDetailDto {
    @ApiProperty({ type: String, example: 'amount', description: 'Campo com problema ("$" para o corpo inteiro)' })
    public field!: string;

    @ApiProperty({ type: String, example: 'string.pattern.base' })
    public code!: string;

    @ApiProperty({ type: String, example: 'O valor deve estar em reais, por exemplo 100.00' })
    public message!: string;
}

export class ApiErrorDto {
    @ApiProperty({ type: String, example: 'VALIDATION_ERROR' })
    public code!: string;

    @ApiProperty({ type: String, example: 'Os dados enviados são inválidos' })
    public message!: string;

    @ApiProperty({ type: String, example: 'req-1', description: 'Também enviado no header x-request-id' })
    public requestId!: string;

    @ApiPropertyOptional({ type: () => [ApiErrorDetailDto], description: 'Presente em erros de validação' })
    public details?: ApiErrorDetailDto[];
}

export class ApiErrorResponseDto {
    @ApiProperty({ type: () => ApiErrorDto })
    public error!: ApiErrorDto;
}

type DataResponseOptions = {
    status?: HttpStatus;
    isArray?: boolean;
    description?: string;
};

/** Documenta uma resposta { data: Model } ou { data: Model[] }. */
export function ApiDataResponse(model: Type<unknown>, options: DataResponseOptions = {}): MethodDecorator & ClassDecorator {
    const item = { $ref: getSchemaPath(model) };

    return applyDecorators(
        ApiExtraModels(model),
        ApiResponse({
            status: options.status ?? HttpStatus.OK,
            description: options.description ?? 'Sucesso',
            schema: {
                type: 'object',
                required: ['data'],
                properties: {
                    data: options.isArray ? { type: 'array', items: item } : item
                }
            }
        })
    );
}

/** Documenta o formato de erro para qualquer status não descrito na rota. */
export function ApiErrorResponses(): MethodDecorator & ClassDecorator {
    return applyDecorators(
        ApiDefaultResponse({ type: ApiErrorResponseDto, description: 'Erro: { error: { code, message, requestId, details? } }' })
    );
}
