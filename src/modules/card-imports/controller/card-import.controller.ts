import {
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Query,
    Req
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiExtraModels,
    ApiNoContentResponse,
    ApiOperation,
    ApiParam,
    ApiTags
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Role } from '../../../generated/prisma/client.js';
import { Roles } from '../../auth/security/auth.decorators.js';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs.js';
import {
    CardImportExclusionDto,
    CardImportOverrideDto,
    CardImportPreviewResponse,
    CardImportResponse,
    CardImportResultResponse,
    CardImportSaveUploadDto,
    CardImportUploadDto,
    CreateCardImportDto,
    ListCardImportsDto
} from '../dto/card-import.dto.js';
import {
    CardImportExclusionsPipe,
    CardImportIdPipe,
    CardImportOverridesPipe,
    CreateCardImportPipe,
    ListCardImportsPipe
} from '../flow/card-import.pipe.js';
import { readStatementUpload } from '../flow/multipart-upload.js';
import { CardImportService } from '../service/card-import.service.js';

const ABSOLUTE_MONTH_NOTE = 'O resultado é absoluto para o mês da fatura: substitui o que havia no cartão naquele mês, '
    + 'menos as compras lançadas em "Adicionar compra".';

@ApiTags('card-imports')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('card-imports')
@Roles(Role.USER)
export class CardImportController {
    private readonly createPipe = new CreateCardImportPipe();
    private readonly overridesPipe = new CardImportOverridesPipe();
    private readonly exclusionsPipe = new CardImportExclusionsPipe();

    public constructor(private readonly cardImportService: CardImportService) { }

    /**
     * multipart/form-data com os campos:
     * - file: arquivo da fatura (.csv para Nubank e C6, .pdf para Neon);
     * - cardId: UUID do cartão;
     * - month: mês da fatura, AAAA-MM;
     * - password: senha do PDF protegido (Neon); não é gravada;
     * - overrides: opcional, JSON com as escolhas feitas na pré-visualização;
     * - exclusions: opcional, JSON com as decisões de excluir/restaurar compras.
     */
    @Post()
    @ApiOperation({
        summary: 'Importa a fatura enviada pelo banco do cartão',
        description: `${ABSOLUTE_MONTH_NOTE} Os campos opcionais overrides e exclusions (JSON) aplicam as escolhas feitas na pré-visualização.`
    })
    @ApiConsumes('multipart/form-data')
    @ApiExtraModels(CardImportOverrideDto, CardImportExclusionDto)
    @ApiBody({ type: CardImportSaveUploadDto })
    @ApiDataResponse(CardImportResultResponse, { status: HttpStatus.CREATED })
    public async create(@Req() request: FastifyRequest): Promise<CardImportResultResponse> {
        const upload = await readStatementUpload(request);
        const fields = this.createPipe.transform(upload.fields) as CreateCardImportDto;
        const overrides = fields.overrides === undefined ? [] : this.overridesPipe.transform(fields.overrides);
        const exclusions = fields.exclusions === undefined ? [] : this.exclusionsPipe.transform(fields.exclusions);

        return this.cardImportService.create(fields, upload.file, overrides, exclusions);
    }

    /**
     * Mesmo formulário do upload (overrides e exclusions, se vierem, são ignorados), mas não grava nada: devolve o que o upload faria,
     * para o usuário revisar e escolher apelido, categoria e pessoa antes de salvar.
     */
    @Post('preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Pré-visualiza a fatura sem gravar nada',
        description: 'Faz as mesmas validações e a mesma leitura do upload e calcula o mesmo plano, sem criar upload nem despesas.'
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: CardImportUploadDto })
    @ApiDataResponse(CardImportPreviewResponse)
    public async preview(@Req() request: FastifyRequest): Promise<CardImportPreviewResponse> {
        const upload = await readStatementUpload(request);
        const fields = this.createPipe.transform(upload.fields) as CreateCardImportDto;

        return this.cardImportService.preview(fields, upload.file);
    }

    @Get()
    @ApiOperation({ summary: 'Histórico de uploads, mais recentes primeiro' })
    @ApiDataResponse(CardImportResponse, { isArray: true })
    public async findAll(
        @Query(ListCardImportsPipe) query: ListCardImportsDto
    ): Promise<CardImportResponse[]> {
        return this.cardImportService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Consulta um upload' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiDataResponse(CardImportResponse)
    public async findById(@Param('id', CardImportIdPipe) id: string): Promise<CardImportResponse> {
        return this.cardImportService.findById(id);
    }

    /** Apaga o upload e as despesas que ele gravou. Não restaura o estado anterior. */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Apaga o upload e as despesas que ele gravou (não restaura o estado anterior)' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiNoContentResponse({ description: 'Upload apagado' })
    public async delete(@Param('id', CardImportIdPipe) id: string): Promise<void> {
        await this.cardImportService.delete(id);
    }
}
