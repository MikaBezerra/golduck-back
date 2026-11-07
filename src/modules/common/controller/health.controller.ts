import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

import { Role } from '../../../generated/prisma/enums';
import { Roles } from '../../auth/security/auth.decorators';
import { PrismaService } from '../provider';
import { ApiDataResponse, ApiErrorResponses } from '../swagger/api-docs';

const INDICATORS = {
    type: 'object',
    additionalProperties: { type: 'object', additionalProperties: true },
    example: { database: { status: 'up' } }
} as const;

export class HealthResponse {
    @ApiProperty({ type: String, enum: ['ok', 'error', 'shutting_down'] })
    public status!: string;

    @ApiPropertyOptional(INDICATORS)
    public info?: Record<string, unknown>;

    @ApiPropertyOptional(INDICATORS)
    public error?: Record<string, unknown>;

    @ApiProperty(INDICATORS)
    public details!: Record<string, unknown>;
}

@ApiTags('health')
@ApiBearerAuth()
@ApiErrorResponses()
@Controller('health')
@Roles(Role.ADMIN)
export class HealthController {

    public constructor(
        private readonly health: HealthCheckService,
        private readonly database: PrismaHealthIndicator,
        private readonly prisma: PrismaService
    ) { }

    @Get()
    @ApiOperation({ summary: 'Estado da API e do banco (somente ADMIN)' })
    @ApiDataResponse(HealthResponse)
    public async healthCheck() {

        return this.health.check([
            async () => this.database.pingCheck('database', this.prisma),
            () => ({
                http: {
                    status: 'up',
                    uptime: process.uptime()
                }
            })
        ]);
    }

}
