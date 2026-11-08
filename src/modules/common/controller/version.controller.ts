import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/security/auth.decorators.js';
import { AppInfo, getAppInfo } from '../logging/app-info.js';
import { ApiDataResponse, ApiErrorResponses } from '../swagger/api-docs.js';

export class VersionResponse implements AppInfo {
    @ApiProperty({ example: 'golduck-back' })
    public name!: string;

    @ApiProperty({ example: '0.1.0' })
    public version!: string;

    @ApiProperty({ type: String, nullable: true, example: 'e7ed4aa', description: 'Commit publicado (7 caracteres)' })
    public commit!: string | null;

    @ApiProperty({ example: 'production', description: 'Valor de APP_ENV' })
    public environment!: string;
}

@ApiTags('health')
@ApiErrorResponses()
@Controller('version')
export class VersionController {

    @Get()
    @Public()
    @ApiOperation({ summary: 'Nome, versão, commit e ambiente da API (público)' })
    @ApiDataResponse(VersionResponse)
    public version(): VersionResponse {
        return { ...getAppInfo() };
    }

}
