import { ApiProperty } from '@nestjs/swagger';

import { UUID_PROPERTY } from '../../common/swagger/api-docs.js';
import { CreditCardSyncResponse } from '../../credit-cards/dto/credit-card.dto.js';

export class CardSyncSummaryResponse {
    @ApiProperty({ type: Number, description: 'Linhas criadas (compras novas e parcelas lançadas)' })
    public created!: number;

    @ApiProperty({ type: Number, description: 'Linhas que mudaram (valor, descrição, parcela...)' })
    public updated!: number;

    @ApiProperty({ type: Number, description: 'Linhas que continuaram iguais' })
    public unchanged!: number;

    @ApiProperty({ type: Number, description: 'Linhas removidas (compra que sumiu ou mudou de fatura)' })
    public removed!: number;

    @ApiProperty({ type: Number, description: 'Compras de "Adicionar compra" substituídas pela do banco' })
    public replacedManual!: number;

    @ApiProperty({ type: Number, description: 'Lançamentos ignorados: pagamentos da fatura e estornos' })
    public ignored!: number;
}

export class CardSyncErrorResponse {
    @ApiProperty({ type: String, example: 'PLUGGY_UNAVAILABLE' })
    public code!: string;

    @ApiProperty({ type: String })
    public message!: string;
}

/** Resultado da sincronização de um cartão. */
export class CardSyncResultResponse {
    @ApiProperty(UUID_PROPERTY)
    public cardId!: string;

    @ApiProperty({ type: String })
    public cardName!: string;

    @ApiProperty({ type: () => CardSyncSummaryResponse, nullable: true, description: 'null quando deu erro' })
    public summary!: CardSyncSummaryResponse | null;

    @ApiProperty({ type: () => CardSyncErrorResponse, nullable: true, description: 'Só em POST /card-sync: o erro deste cartão' })
    public error!: CardSyncErrorResponse | null;

    @ApiProperty({ type: () => CreditCardSyncResponse })
    public sync!: CreditCardSyncResponse;
}
