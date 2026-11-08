import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Public, Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import { CreditCardIdPipe } from '../../credit-cards/flow/credit-card.pipe.js';
import { CardSyncResultResponse } from '../dto/card-sync.dto.js';
import { CardSyncService } from '../service/card-sync.service.js';

const SYNC_NOTE = 'Busca as compras no Meu Pluggy (que atualiza os dados 1 vez por dia) e grava as faturas a partir da '
    + 'primeira fatura sincronizada do cartão: compras novas entram, as que mudaram de fatura mudam, as que sumiram saem. '
    + 'Apelido, categoria, pessoa, exclusões e as correções de mês/parcela são mantidos.';

@ApiTags('card-sync')
@ApiErrorResponses()
@Controller()
export class CardSyncController {
    public constructor(private readonly cardSyncService: CardSyncService) { }

    @Post('credit-cards/:id/sync')
    @HttpCode(HttpStatus.OK)
    @Roles(Role.USER)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Sincroniza um cartão com o Meu Pluggy (botão "Atualizar")', description: SYNC_NOTE })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CardSyncResultResponse)
    public async syncCard(@Param('id', CreditCardIdPipe) id: string): Promise<CardSyncResultResponse> {
        return this.cardSyncService.syncCard(id);
    }

    @Post('card-sync')
    @HttpCode(HttpStatus.OK)
    @Roles(Role.USER)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Sincroniza todos os cartões ligados ao Meu Pluggy',
        description: `${SYNC_NOTE} O erro de um cartão não impede os outros: ele vem no resultado daquele cartão.`
    })
    @ApiDataResponse(CardSyncResultResponse, { isArray: true })
    public async syncAll(): Promise<CardSyncResultResponse[]> {
        return this.cardSyncService.syncAll();
    }

    @Get('card-sync/cron')
    @Public()
    @ApiOperation({
        summary: 'Rotina diária da Vercel: sincroniza todos os cartões',
        description: 'Sem login: exige o header Authorization: Bearer <CRON_SECRET> (401 CRON_UNAUTHORIZED).'
    })
    @ApiHeader({ name: 'Authorization', description: 'Bearer <CRON_SECRET>', required: true })
    @ApiDataResponse(CardSyncResultResponse, { isArray: true })
    public async cron(@Headers('authorization') authorization: string | undefined): Promise<CardSyncResultResponse[]> {
        this.cardSyncService.verifyCronAuthorization(authorization);

        return this.cardSyncService.syncAll();
    }
}
