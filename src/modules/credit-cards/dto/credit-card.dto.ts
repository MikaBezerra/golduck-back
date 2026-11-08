import type { BillBoundarySource } from '../service/billing-calendar.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CardBank } from '../../../generated/prisma/client.js';
import { DATE_PATTERN, DATE_TIME_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs.js';

const BANK_PROPERTY = {
    enum: CardBank,
    enumName: 'CardBank',
    description: 'Banco do cartão: define o tradutor da sincronização e o formato de fatura aceito no upload '
        + '(NUBANK e C6 em CSV, NEON em PDF)'
};
const DAY_PROPERTY = { type: Number, minimum: 1, maximum: 31 };
const DUE_DAY_PROPERTY = { ...DAY_PROPERTY, example: 1, description: 'Dia do vencimento: a fatura recebe o nome do mês em que vence' };
const BEST_DAY_PROPERTY = {
    ...DAY_PROPERTY,
    example: 25,
    description: 'Melhor dia de compra padrão: compras a partir dele vão para a fatura seguinte. Ajustável por fatura.'
};
const ITEM_PROPERTY = { ...UUID_PROPERTY, description: 'Id do item (conexão do banco) no Meu Pluggy' };
const SYNC_FROM_PROPERTY = {
    ...MONTH_PROPERTY,
    description: 'Primeira fatura (mês do vencimento) controlada pela sincronização; as anteriores ficam como estão'
};
const DAY_DATE_PROPERTY = { type: String, format: 'date', pattern: DATE_PATTERN, example: '2026-11-25' };

export class CreateCreditCardDto {
    @ApiProperty({ type: String, maxLength: 120, example: 'Nubank Mikaell' })
    public name!: string;

    @ApiProperty(BANK_PROPERTY)
    public bank!: CardBank;

    @ApiPropertyOptional(DUE_DAY_PROPERTY)
    public dueDay?: number;

    @ApiPropertyOptional(BEST_DAY_PROPERTY)
    public bestPurchaseDay?: number;

    @ApiPropertyOptional(ITEM_PROPERTY)
    public pluggyItemId?: string;

    @ApiPropertyOptional(SYNC_FROM_PROPERTY)
    public syncFromMonth?: string;
}

export class UpdateCreditCardDto {
    @ApiPropertyOptional({ type: String, maxLength: 120 })
    public name?: string;

    @ApiPropertyOptional({ type: Boolean })
    public active?: boolean;

    @ApiPropertyOptional(DUE_DAY_PROPERTY)
    public dueDay?: number;

    @ApiPropertyOptional(BEST_DAY_PROPERTY)
    public bestPurchaseDay?: number;

    @ApiPropertyOptional({ ...ITEM_PROPERTY, nullable: true, description: 'null desliga a sincronização do cartão' })
    public pluggyItemId?: string | null;

    @ApiPropertyOptional({ ...SYNC_FROM_PROPERTY, nullable: true })
    public syncFromMonth?: string | null;
}

/** Situação da sincronização com o Meu Pluggy. */
export class CreditCardSyncResponse {
    @ApiProperty({ type: Boolean, description: 'Cartão ligado a um item do Meu Pluggy e com vencimento, melhor dia e mês inicial' })
    public configured!: boolean;

    @ApiProperty({ ...DATE_TIME_PROPERTY, nullable: true, description: 'Fim da última sincronização que deu certo' })
    public syncedAt!: Date | null;

    @ApiProperty({ ...DATE_TIME_PROPERTY, nullable: true, description: 'Última atualização dos dados na Pluggy (atualiza 1 vez por dia)' })
    public dataUpdatedAt!: Date | null;

    @ApiProperty({ type: String, nullable: true, example: 'UPDATED', description: 'Situação do item na Pluggy' })
    public status!: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Erro da última tentativa; null quando ela deu certo' })
    public error!: string | null;

    @ApiProperty({ ...DATE_TIME_PROPERTY, nullable: true, description: 'Fim da autorização do Open Finance (renovar no Meu Pluggy)' })
    public consentExpiresAt!: Date | null;
}

export class CreditCardResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty(BANK_PROPERTY)
    public bank!: CardBank;

    @ApiProperty({ type: Boolean })
    public active!: boolean;

    @ApiProperty({ ...DUE_DAY_PROPERTY, nullable: true })
    public dueDay!: number | null;

    @ApiProperty({ ...BEST_DAY_PROPERTY, nullable: true })
    public bestPurchaseDay!: number | null;

    @ApiProperty({ ...ITEM_PROPERTY, nullable: true })
    public pluggyItemId!: string | null;

    @ApiProperty({ ...SYNC_FROM_PROPERTY, nullable: true })
    public syncFromMonth!: string | null;

    @ApiProperty({ type: () => CreditCardSyncResponse })
    public sync!: CreditCardSyncResponse;

    @ApiProperty(DATE_TIME_PROPERTY)
    public createdAt!: Date;

    @ApiProperty(DATE_TIME_PROPERTY)
    public updatedAt!: Date;
}

export class ListCreditCardBillsDto {
    @ApiPropertyOptional({ ...MONTH_PROPERTY, description: 'Primeira fatura; padrão: a anterior à aberta' })
    public from?: string;

    @ApiPropertyOptional({ ...MONTH_PROPERTY, description: 'Última fatura; padrão: duas depois da aberta (no máximo 24 faturas)' })
    public to?: string;
}

export class UpdateCreditCardBillDto {
    @ApiProperty({
        ...DAY_DATE_PROPERTY,
        nullable: true,
        description: 'Melhor dia de compra desta fatura (o app do banco mostra). null volta ao padrão do cartão. '
            + 'Depois que a fatura fecha, o fechamento informado pelo banco prevalece.'
    })
    public bestPurchaseDate!: string | null;
}

/** Uma fatura do cartão: de quando a quando vão as compras e quando vence. */
export class CreditCardBillResponse {
    @ApiProperty({ ...MONTH_PROPERTY, description: 'Mês da fatura (o do vencimento)' })
    public month!: string;

    @ApiProperty({ ...DAY_DATE_PROPERTY, description: 'Primeiro dia de compra desta fatura' })
    public startDate!: string;

    @ApiProperty({ ...DAY_DATE_PROPERTY, description: 'Último dia de compra desta fatura (o fechamento)' })
    public closingDate!: string;

    @ApiProperty({ ...DAY_DATE_PROPERTY, description: 'Melhor dia de compra: a partir dele, a compra vai para a fatura seguinte' })
    public bestPurchaseDate!: string;

    @ApiProperty({ ...DAY_DATE_PROPERTY, description: 'Vencimento informado pelo banco ou, antes disso, o dia do vencimento do cartão' })
    public dueDate!: string;

    @ApiProperty({
        type: String,
        enum: ['bank', 'user', 'default'],
        enumName: 'BillBoundarySource',
        description: 'De onde veio o melhor dia: bank (fechamento informado pelo banco), user (ajuste do usuário) ou default (padrão do cartão)'
    })
    public source!: BillBoundarySource;

    @ApiProperty({ ...DAY_DATE_PROPERTY, nullable: true, description: 'Ajuste do usuário, mesmo quando o fechamento do banco prevalece' })
    public userBestPurchaseDate!: string | null;
}
