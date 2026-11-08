import { LoggerService as NestLoggerService } from '@nestjs/common';

import { LoggerService } from '../provider/logger.service.js';
import { describeError } from './describe-error.js';

/** Contexto que o Nest usa ao registrar um erro de inicialização. */
const BOOTSTRAP_ERROR_CONTEXT = 'ExceptionHandler';

/**
 * Direciona o log interno do Nest (subida, mapeamento de rotas, erros de inicialização) para o
 * nosso logger, no mesmo formato. As mensagens informativas do Nest viram debug: com
 * LOG_LEVEL=info aparece só o resumo "API no ar"; com debug, tudo.
 */
export class NestLoggerAdapter implements NestLoggerService {

    public constructor(private readonly logger: LoggerService) { }

    public log(message: unknown, ...optionalParams: unknown[]): void {
        this.logger.debug(this.text(message), this.context(optionalParams));
    }

    public debug(message: unknown, ...optionalParams: unknown[]): void {
        this.logger.debug(this.text(message), this.context(optionalParams));
    }

    public verbose(message: unknown, ...optionalParams: unknown[]): void {
        this.logger.debug(this.text(message), this.context(optionalParams));
    }

    public warn(message: unknown, ...optionalParams: unknown[]): void {
        this.logger.warn(this.text(message), this.context(optionalParams));
    }

    public error(message: unknown, ...optionalParams: unknown[]): void {
        // O Nest chama error(mensagem, pilha?, contexto?) ou error(Error, contexto?).
        const strings = optionalParams.filter((param): param is string => typeof param === 'string');
        const stack = strings.length > 1 ? strings[0] : undefined;
        const context = this.context(optionalParams);
        const metadata = {
            ...context,
            ...(message instanceof Error ? describeError(message) : {}),
            ...(stack ? { stack } : {})
        };

        // Erro na subida: o Nest registra e relança; o catch do server.ts registra de novo como "Falha ao iniciar a API".
        if (context.context === BOOTSTRAP_ERROR_CONTEXT) {
            this.logger.debug(this.text(message), metadata);
            return;
        }

        this.logger.error(this.text(message), metadata);
    }

    public fatal(message: unknown, ...optionalParams: unknown[]): void {
        this.error(message, ...optionalParams);
    }

    private text(message: unknown): string {
        if (typeof message === 'string') {
            return message;
        }

        return message instanceof Error ? message.message : JSON.stringify(message) ?? String(message);
    }

    /** O último parâmetro de texto é o contexto (ex.: "RoutesResolver"). */
    private context(optionalParams: unknown[]): Record<string, unknown> {
        const context = optionalParams.at(-1);

        return typeof context === 'string' ? { context } : {};
    }

}
