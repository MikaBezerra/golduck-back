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
import type { FastifyRequest } from 'fastify';

import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/security/auth.decorators';
import {
    CardImportResponse,
    CardImportResultResponse,
    CreateCardImportDto,
    CreateManualCardImportDto,
    ListCardImportsDto
} from '../dto/card-import.dto';
import {
    CardImportIdPipe,
    CreateCardImportPipe,
    CreateManualCardImportPipe,
    ListCardImportsPipe
} from '../flow/card-import.pipe';
import { readStatementUpload } from '../flow/multipart-upload';
import { CardImportService } from '../service/card-import.service';

@Controller('card-imports')
@Roles(Role.USER)
export class CardImportController {
    private readonly createPipe = new CreateCardImportPipe();

    public constructor(private readonly cardImportService: CardImportService) { }

    /**
     * multipart/form-data com os campos:
     * - file: arquivo da fatura (.csv para Nubank e C6);
     * - cardId: UUID do cartão;
     * - month: mês da fatura, AAAA-MM;
     * - password: opcional, para arquivos protegidos.
     */
    @Post()
    public async create(@Req() request: FastifyRequest): Promise<CardImportResultResponse> {
        const upload = await readStatementUpload(request);
        const fields = this.createPipe.transform(upload.fields) as CreateCardImportDto;

        return this.cardImportService.create(fields, upload.file);
    }

    /**
     * Fatura digitada lançamento por lançamento, sem arquivo. Como no upload,
     * substitui tudo o que existe no cartão para o mês informado.
     */
    @Post('manual')
    public async createManual(
        @Body(CreateManualCardImportPipe) body: CreateManualCardImportDto
    ): Promise<CardImportResultResponse> {
        return this.cardImportService.createManual(body);
    }

    @Get()
    public async findAll(
        @Query(ListCardImportsPipe) query: ListCardImportsDto
    ): Promise<CardImportResponse[]> {
        return this.cardImportService.findAll(query);
    }

    @Get(':id')
    public async findById(@Param('id', CardImportIdPipe) id: string): Promise<CardImportResponse> {
        return this.cardImportService.findById(id);
    }

    /** Apaga o upload e as despesas que ele gravou. Não restaura o estado anterior. */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    public async delete(@Param('id', CardImportIdPipe) id: string): Promise<void> {
        await this.cardImportService.delete(id);
    }
}
