import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import {
    CreateSummaryDispatchDto,
    SummaryDispatchMonthDto,
    SummaryDispatchPreviewResponse,
    SummaryDispatchResponse,
    SummaryEmailPreviewResponse,
    SummaryEmailQueryDto
} from '../dto/summary-dispatch.dto.js';
import {
    CreateSummaryDispatchPipe,
    IdempotencyKey,
    SummaryDispatchMonthPipe,
    SummaryEmailQueryPipe
} from '../flow/summary-dispatch.pipe.js';
import { SummaryDispatchService } from '../service/summary-dispatch.service.js';

@ApiTags('summary-dispatches')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('summary/dispatches')
@Roles(Role.ADMIN)
export class SummaryDispatchController {
    public constructor(private readonly dispatchService: SummaryDispatchService) { }

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Envia por e-mail o resumo do mês para cada pessoa ativa (ou só para personIds)',
        description: 'Responde 200 mesmo com falhas parciais: cada pessoa vira um item (SENT, SKIPPED_NO_EMAIL ou FAILED, com mensagem). '
            + 'A mesma Idempotency-Key devolve o resultado gravado, sem reenviar. Outro envio do mês em andamento: 409 SUMMARY_DISPATCH_IN_PROGRESS. '
            + 'E-mail desligado ou fora do ar: 503 MAIL_DISABLED / MAIL_UNAVAILABLE (ninguém recebe). Só ADMIN.'
    })
    @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID gerado pelo front a cada intenção de envio' })
    @ApiDataResponse(SummaryDispatchResponse)
    public async dispatch(
        @Body(CreateSummaryDispatchPipe) body: CreateSummaryDispatchDto,
        @IdempotencyKey() idempotencyKey: string
    ): Promise<SummaryDispatchResponse> {
        return this.dispatchService.dispatch(body, idempotencyKey);
    }

    @Get('preview')
    @ApiOperation({ summary: 'Quem vai receber o resumo do mês (e-mail mascarado) e o último envio, para a confirmação na tela' })
    @ApiDataResponse(SummaryDispatchPreviewResponse)
    public async preview(
        @Query(SummaryDispatchMonthPipe) query: SummaryDispatchMonthDto
    ): Promise<SummaryDispatchPreviewResponse> {
        return this.dispatchService.preview(query.month);
    }

    @Get('email')
    @ApiOperation({ summary: 'O e-mail de uma pessoa (assunto, HTML e texto) como ela vai receber, sem enviar' })
    @ApiDataResponse(SummaryEmailPreviewResponse)
    public async emailPreview(
        @Query(SummaryEmailQueryPipe) query: SummaryEmailQueryDto
    ): Promise<SummaryEmailPreviewResponse> {
        return this.dispatchService.emailPreview(query);
    }

    @Get()
    @ApiOperation({ summary: 'Envios do mês, do mais recente para o mais antigo (até 20)' })
    @ApiDataResponse(SummaryDispatchResponse, { isArray: true })
    public async history(
        @Query(SummaryDispatchMonthPipe) query: SummaryDispatchMonthDto
    ): Promise<SummaryDispatchResponse[]> {
        return this.dispatchService.history(query.month);
    }
}
