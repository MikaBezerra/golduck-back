import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CardExpenseOrigin } from '../../../generated/prisma/client.js';

import {
    DATE_PATTERN,
    DATE_TIME_PROPERTY,
    MONEY_PROPERTY,
    MONTH_PROPERTY,
    UUID_PROPERTY
} from '../../common/swagger/api-docs.js';
import { CARD_EXPENSE_SCOPES, CardExpenseScope } from '../service/card-expense-scope.js';

export const SCOPE_PROPERTY = {
    type: String,
    enum: CARD_EXPENSE_SCOPES,
    enumName: 'CardExpenseScope',
    description: 'Parcelas afetadas a partir do mês da linha: month (só ele), forward (ele e os seguintes), '
        + 'backward (ele e os anteriores), all (todas). Em compra à vista, só a própria linha.'
};

export class CardInstallmentDto {
    @ApiProperty({ type: Number, minimum: 1, maximum: 99, example: 3 })
    public number!: number;

    @ApiProperty({ type: Number, minimum: 1, maximum: 99, example: 10 })
    public total!: number;
}

export class ListCardExpensesDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiPropertyOptional(UUID_PROPERTY)
    public cardId?: string;

    @ApiPropertyOptional({ type: Boolean, default: false, description: 'Inclui as despesas excluídas' })
    public includeExcluded!: boolean;
}

export class CardExpenseChangesDto {
    @ApiPropertyOptional({ type: String, maxLength: 160, nullable: true, description: 'null remove o apelido' })
    public nickname?: string | null;

    @ApiPropertyOptional(UUID_PROPERTY)
    public categoryId?: string;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'null torna a despesa compartilhada' })
    public personId?: string | null;
}

export class UpdateCardExpensesDto {
    @ApiProperty({ type: [String], format: 'uuid', minItems: 1, uniqueItems: true })
    public ids!: string[];

    @ApiProperty({ type: () => CardExpenseChangesDto, description: 'Pelo menos um campo' })
    public changes!: CardExpenseChangesDto;
}

export class CardExpenseScopeDto {
    @ApiProperty({ type: [String], format: 'uuid', minItems: 1, uniqueItems: true })
    public ids!: string[];

    @ApiProperty(SCOPE_PROPERTY)
    public scope!: CardExpenseScope;
}

/** "Adicionar compra": uma compra que está faltando numa fatura. */
export class CreateCardExpenseDto {
    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura (o do vencimento)' })
    public month!: string;

    @ApiProperty({ type: String, format: 'date', pattern: DATE_PATTERN, example: '2026-11-06', description: 'Data da compra' })
    public date!: string;

    @ApiProperty({ type: String, maxLength: 200, example: 'Padaria' })
    public description!: string;

    @ApiProperty({ ...MONEY_PROPERTY, description: 'Valor da parcela (ou da compra à vista) em reais' })
    public amount!: string;

    @ApiPropertyOptional({
        type: () => CardInstallmentDto,
        nullable: true,
        description: 'Parcela que cai neste mês; as seguintes são lançadas nos meses seguintes. Omitido ou null = à vista.'
    })
    public installment?: CardInstallmentDto | null;

    @ApiPropertyOptional({ type: String, maxLength: 160, nullable: true })
    public nickname?: string | null;

    @ApiPropertyOptional({ ...UUID_PROPERTY, description: 'Padrão: a categoria padrão ("Outros")' })
    public categoryId?: string;

    @ApiPropertyOptional({ ...UUID_PROPERTY, nullable: true, description: 'null ou omitido = compartilhada' })
    public personId?: string | null;
}

/** Corrige em que fatura cai a compra (e, se quiser, qual parcela é): vale para a compra inteira. */
export class MoveCardExpenseDto {
    @ApiProperty({ ...MONTH_PROPERTY, description: 'Fatura em que esta linha deve ficar' })
    public month!: string;

    @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 99, example: 1, description: 'Parcela que esta linha passa a ser; padrão: a atual' })
    public installmentNumber?: number;

    @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 99, example: 5, description: 'Total de parcelas; padrão: o atual' })
    public installmentTotal?: number;
}

export class CardExpenseResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'Upload que gravou esta linha por último; null quando veio da sincronização ou de "Adicionar compra"' })
    public importId!: string | null;

    @ApiProperty({
        type: String,
        enum: CardExpenseOrigin,
        enumName: 'CardExpenseOrigin',
        description: 'UPLOAD (fatura enviada por arquivo), SYNC (Meu Pluggy) ou MANUAL ("Adicionar compra")'
    })
    public origin!: CardExpenseOrigin;

    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura' })
    public month!: string;

    @ApiProperty({ type: String, format: 'date', pattern: DATE_PATTERN, example: '2026-10-26', description: 'Data informada pelo banco' })
    public transactionDate!: string;

    /** Apelido, quando existir; senão, a descrição original do banco. */
    @ApiProperty({ type: String, description: 'Apelido, quando existir; senão, a descrição original do banco' })
    public description!: string;

    @ApiProperty({ type: String })
    public originalDescription!: string;

    @ApiProperty({ type: String, nullable: true })
    public nickname!: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Titular do cartão, quando o banco informa' })
    public holderName!: string | null;

    @ApiProperty({ type: String, nullable: true, example: '1951' })
    public cardLastDigits!: string | null;

    @ApiProperty(MONEY_PROPERTY)
    public amount!: string;

    @ApiProperty({ type: () => CardInstallmentDto, nullable: true })
    public installment!: CardInstallmentDto | null;

    @ApiProperty(UUID_PROPERTY)
    public categoryId!: string;

    @ApiProperty({ ...UUID_PROPERTY, nullable: true, description: 'null = compartilhada' })
    public personId!: string | null;

    @ApiProperty({ type: Boolean, description: 'Excluída: fora das listas (salvo includeExcluded) e dos totais' })
    public excluded!: boolean;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}
