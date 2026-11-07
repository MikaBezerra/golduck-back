import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {

    public constructor() {
        super({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL
            })
        });
    }

    public async onModuleInit() {
        await this.$connect();
    }

    /** Fecha as conexões ao desligar (SIGTERM/SIGINT), sem deixar sessões presas no banco. */
    public async onModuleDestroy() {
        await this.$disconnect();
    }

}
