import type { LoggerService } from '../../provider/logger.service.js';
import { jest } from '@jest/globals';

import { registerProcessErrorLogging } from '../../logging/process-logging.js';

type Listener = (...args: unknown[]) => void;

/*
 * Os handlers são registrados de verdade no process, mas o teste os chama diretamente (sem lançar
 * nada fora do Jest) e troca o process.exit por um espião, para não derrubar o Jest.
 */
describe('registerProcessErrorLogging', () => {
    const logger = { error: jest.fn<LoggerService['error']>() };
    let added: Array<{ event: 'unhandledRejection' | 'uncaughtException'; listener: Listener }>;

    /** Registra e devolve só os listeners novos de cada evento. */
    const register = (): Record<'unhandledRejection' | 'uncaughtException', Listener[]> => {
        const before = {
            unhandledRejection: process.listeners('unhandledRejection'),
            uncaughtException: process.listeners('uncaughtException')
        };

        registerProcessErrorLogging(logger as unknown as LoggerService);

        const result = {
            unhandledRejection: process.listeners('unhandledRejection').filter(listener => !before.unhandledRejection.includes(listener)) as Listener[],
            uncaughtException: process.listeners('uncaughtException').filter(listener => !before.uncaughtException.includes(listener)) as Listener[]
        };

        added = [
            ...result.unhandledRejection.map(listener => ({ event: 'unhandledRejection' as const, listener })),
            ...result.uncaughtException.map(listener => ({ event: 'uncaughtException' as const, listener }))
        ];

        return result;
    };

    beforeEach(() => {
        added = [];
        logger.error.mockClear();
    });

    afterEach(() => {
        for (const { event, listener } of added) {
            process.removeListener(event, listener);
        }

        jest.restoreAllMocks();
    });

    it('registra um listener para cada evento', () => {
        const listeners = register();

        expect(listeners.unhandledRejection).toHaveLength(1);
        expect(listeners.uncaughtException).toHaveLength(1);
    });

    it('promise rejeitada sem tratamento: registra o motivo e não encerra a API', () => {
        const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const { unhandledRejection: [onRejection] } = register();
        const reason = new Error('consulta falhou');

        onRejection(reason, Promise.resolve());
        onRejection('só um texto', Promise.resolve());

        expect(logger.error.mock.calls).toEqual([
            ['Promise rejeitada sem tratamento', { errorName: 'Error', errorMessage: 'consulta falhou', stack: reason.stack }],
            ['Promise rejeitada sem tratamento', { errorName: 'Erro', errorMessage: 'só um texto' }]
        ]);
        expect(exit).not.toHaveBeenCalled();
    });

    it('exceção não tratada: registra e só depois encerra com código 1', () => {
        const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const { uncaughtException: [onException] } = register();
        const error = new TypeError('estado incerto');

        onException(error, 'uncaughtException');

        expect(logger.error).toHaveBeenCalledWith('Exceção não tratada; encerrando a API', {
            errorName: 'TypeError', errorMessage: 'estado incerto', stack: error.stack
        });
        expect(exit).toHaveBeenCalledWith(1);
        expect(logger.error.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0]);
    });
});
