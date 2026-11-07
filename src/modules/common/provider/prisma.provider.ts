import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../../generated/prisma/client';
import { readLogSettings } from '../logging/log-settings';
import { truncateText } from '../logging/sanitize';
import { LoggerService } from './logger.service';

/** Tamanho máximo do SQL registrado numa consulta lenta. */
const MAX_LOGGED_QUERY_LENGTH = 1000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {

    /**
     * Dentro do Nest recebe o logger e registra consultas lentas (SLOW_QUERY_MS), avisos e erros do Prisma.
     * Fora dele (ex.: scripts) pode ser criado sem logger: `new PrismaService()`.
     */
    public constructor(@Optional() logger?: LoggerService) {
        super({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL
            }),
            log: logger
                ? [
                    { emit: 'event', level: 'query' },
                    { emit: 'event', level: 'warn' },
                    { emit: 'event', level: 'error' }
                ]
                : []
        });

        if (logger) {
            this.logEvents(logger);
        }
    }

    public async onModuleInit() {
        await this.$connect();
    }

    /** Fecha as conexões ao desligar (SIGTERM/SIGINT), sem deixar sessões presas no banco. */
    public async onModuleDestroy() {
        await this.$disconnect();
    }

    private logEvents(logger: LoggerService): void {
        const { slowQueryMs } = readLogSettings();
        // O tipo de $on depende das opções de log; aqui elas são fixas (query, warn e error).
        const client = this as unknown as PrismaClient<'query' | 'warn' | 'error'>;

        // Os parâmetros da consulta ficam de fora do log: podem conter dados pessoais.
        client.$on('query', event => {
            const data = { durationMs: Math.round(event.duration), sql: truncateText(event.query, MAX_LOGGED_QUERY_LENGTH) };

            if (event.duration >= slowQueryMs) {
                logger.warn('Consulta lenta no banco', data);
            } else {
                logger.debug('Consulta no banco', data);
            }
        });

        client.$on('warn', event => {
            logger.warn('Aviso do Prisma', { detail: event.message, target: event.target });
        });

        client.$on('error', event => {
            logger.error('Erro do Prisma', { detail: event.message, target: event.target });
        });
    }

}
