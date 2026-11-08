import { LoggerService } from '../provider/logger.service.js';
import { describeError } from './describe-error.js';

/**
 * Erros que escapam de tudo (promise sem catch, exceção fora de requisição) também vão para o log.
 * Uma exceção não tratada deixa o processo em estado incerto: registra e encerra com código 1.
 */
export function registerProcessErrorLogging(logger: LoggerService): void {
    process.on('unhandledRejection', reason => {
        logger.error('Promise rejeitada sem tratamento', describeError(reason));
    });

    process.on('uncaughtException', error => {
        logger.error('Exceção não tratada; encerrando a API', describeError(error));
        process.exit(1);
    });
}
