import { Controller, Get} from '@nestjs/common';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

import { Role } from '../../../generated/prisma/enums';
import { Roles } from '../../auth/security/auth.decorators';
import { PrismaService } from '../provider';

@Controller('health')
export class HealthController {

    public constructor(
        private readonly health: HealthCheckService,
        private readonly database: PrismaHealthIndicator,
        private readonly prisma: PrismaService
    ) { }

    @Get()
    @Roles(Role.ADMIN)
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
