import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DATE_TIME_PROPERTY, MONTH_PROPERTY, UUID_PROPERTY } from '../../common/swagger/api-docs.js';
import { SummaryPendingDto } from '../../summary/dto/summary.dto.js';

const RECIPIENT_PROPERTY = {
    type: String,
    nullable: true,
    example: 'ay•••@gmail.com',
    description: 'E-mail mascarado; null quando a pessoa não tem e-mail cadastrado'
} as const;

export class SummaryDispatchMonthDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;
}

export class CreateSummaryDispatchDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiPropertyOptional({
        type: [String],
        format: 'uuid',
        description: 'Só estas pessoas (por exemplo, reenviar para quem falhou). Vazio = todas as pessoas ativas do mês'
    })
    public personIds?: string[];
}

export class SummaryEmailQueryDto {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty(UUID_PROPERTY)
    public personId!: string;
}

export type SummaryDispatchItemStatusValue = 'SENT' | 'SKIPPED_NO_EMAIL' | 'FAILED';

export class SummaryDispatchItemDto {
    @ApiProperty(UUID_PROPERTY)
    public personId!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ type: String, enum: ['SENT', 'SKIPPED_NO_EMAIL', 'FAILED'] })
    public status!: SummaryDispatchItemStatusValue;

    @ApiProperty(RECIPIENT_PROPERTY)
    public recipient!: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        enum: ['MAIL_RECIPIENT_REJECTED', 'MAIL_CONNECTION_FAILED', 'MAIL_SEND_FAILED'],
        description: 'Só em FAILED'
    })
    public errorCode!: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'Ayanne não tem e-mail cadastrado.',
        description: 'Mensagem pronta para a tela (em SKIPPED_NO_EMAIL e FAILED)'
    })
    public message!: string | null;
}

export class SummaryDispatchCountsDto {
    @ApiProperty({ type: Number })
    public sent!: number;

    @ApiProperty({ type: Number })
    public skipped!: number;

    @ApiProperty({ type: Number })
    public failed!: number;
}

export class SummaryDispatchResponse {
    @ApiProperty(UUID_PROPERTY)
    public id!: string;

    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: String, enum: ['EMAIL'] })
    public channel!: 'EMAIL';

    @ApiProperty({ type: String, enum: ['RUNNING', 'DONE', 'INTERRUPTED'], description: 'INTERRUPTED = a função parou no meio' })
    public status!: 'RUNNING' | 'DONE' | 'INTERRUPTED';

    @ApiProperty(DATE_TIME_PROPERTY)
    public startedAt!: Date;

    @ApiProperty({ ...DATE_TIME_PROPERTY, nullable: true })
    public finishedAt!: Date | null;

    @ApiProperty({ type: SummaryDispatchCountsDto })
    public counts!: SummaryDispatchCountsDto;

    @ApiProperty({ type: [SummaryDispatchItemDto], description: 'Uma linha por pessoa, em ordem alfabética' })
    public items!: SummaryDispatchItemDto[];
}

export class SummaryDispatchRecipientDto {
    @ApiProperty(UUID_PROPERTY)
    public personId!: string;

    @ApiProperty({ type: String })
    public name!: string;

    @ApiProperty({ type: Boolean })
    public hasEmail!: boolean;

    @ApiProperty(RECIPIENT_PROPERTY)
    public recipient!: string | null;
}

export class SummaryDispatchPreviewResponse {
    @ApiProperty(MONTH_PROPERTY)
    public month!: string;

    @ApiProperty({ type: Boolean, description: 'Envio de e-mail ligado neste ambiente (MAIL_ENABLED=1)' })
    public enabled!: boolean;

    @ApiProperty({ type: [SummaryDispatchRecipientDto], description: 'Pessoas ativas do mês, em ordem alfabética' })
    public recipients!: SummaryDispatchRecipientDto[];

    @ApiProperty({ type: SummaryDispatchResponse, nullable: true, description: 'Último envio do mês; null se nunca foi enviado' })
    public lastDispatch!: SummaryDispatchResponse | null;

    @ApiProperty({
        type: () => SummaryPendingDto,
        description: 'Compras do cartão do mês sem pessoa; com count > 0 o envio é recusado (SUMMARY_DISPATCH_PENDING_EXPENSES)'
    })
    public pending!: SummaryPendingDto;
}

export class SummaryEmailPreviewResponse {
    @ApiProperty(UUID_PROPERTY)
    public personId!: string;

    @ApiProperty(RECIPIENT_PROPERTY)
    public recipient!: string | null;

    @ApiProperty({ type: String, example: 'Golduck · Resumo de novembro/2026 (até 08/11)' })
    public subject!: string;

    @ApiProperty({ type: String, description: 'Corpo do e-mail em HTML (como a pessoa recebe)' })
    public html!: string;

    @ApiProperty({ type: String, description: 'Versão em texto puro' })
    public text!: string;
}
