import {
    Body,
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

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-docs';
import {
    CardImportOverrideDto,
    CardImportPreviewResponse,
    CardImportResponse,
    CardImportResultResponse,
    CardImportSaveUploadDto,
    CardImportUploadDto,
    CreateCardImportDto,
    CreateManualCardImportDto,
    ListCardImportsDto
} from '../dto/card-import.dto';
import {
    CardImportIdPipe,
    CardImportOverridesPipe,
    CreateCardImportPipe,
    CreateManualCardImportPipe,
    ListCardImportsPipe
} from '../flow/card-import.pipe';
import { readStatementUpload } from '../flow/multipart-upload';
import { CardImportService } from '../service/card-import.service';

const ABSOLUTE_MONTH_NOTE = 'O resultado é absoluto para o mês da fatura: substitui o que havia no cartão naquele mês.';

@ApiTags('card-imports')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('card-imports')
@Roles(Role.USER)
export class CardImportController {
    private readonly createPipe = new CreateCardImportPipe();
    private readonly overridesPipe = new CardImportOverridesPipe();

    public constructor(private readonly cardImportService: CardImportService) { }

    /**
     * multipart/form-data com os campos:
     * - file: arquivo da fatura (.csv para Nubank e C6, .pdf para Neon);
     * - cardId: UUID do cartão;
     * - month: mês da fatura, AAAA-MM;
     * - password: senha do PDF protegido (Neon); não é gravada;
     * - overrides: opcional, JSON com as escolhas feitas na pré-visualização.
     */
    @Post()
    @ApiOperation({
        summary: 'Importa a fatura enviada pelo banco do cartão',
        description: `${ABSOLUTE_MONTH_NOTE  } O campo opcional overrides (JSON) aplica as escolhas feitas na pré-visualização.`
    })
    @ApiConsumes('multipart/form-data')
    @ApiExtraModels(CardImportOverrideDto)
    @ApiBody({ type: CardImportSaveUploadDto })
    @ApiDataResponse(CardImportResultResponse, { status: HttpStatus.CREATED })
    public async create(@Req() request: FastifyRequest): Promise<CardImportResultResponse> {
        const upload = await readStatementUpload(request);
        const fields = this.createPipe.transform(upload.fields) as CreateCardImportDto;
        const overrides = fields.overrides === undefined ? [] : this.overridesPipe.transform(fields.overrides);

        return this.cardImportService.create(fields, upload.file, overrides);
    }

    /**
     * Mesmo formulário do upload (o campo overrides, se vier, é ignorado), mas não grava nada: devolve o que o upload faria,
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

    /**
     * Fatura digitada lançamento por lançamento, sem arquivo. Como no upload,
     * substitui tudo o que existe no cartão para o mês informado.
     */
    @Post('manual')
    @ApiOperation({ summary: 'Registra uma fatura digitada, sem arquivo', description: ABSOLUTE_MONTH_NOTE })
    @ApiDataResponse(CardImportResultResponse, { status: HttpStatus.CREATED })
    public async createManual(
        @Body(CreateManualCardImportPipe) body: CreateManualCardImportDto
    ): Promise<CardImportResultResponse> {
        return this.cardImportService.createManual(body);
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
