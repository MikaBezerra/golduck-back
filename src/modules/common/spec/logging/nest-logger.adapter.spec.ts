import type { LoggerService } from '../../provider/logger.service';
import { jest } from '@jest/globals';

import { NestLoggerAdapter } from '../../logging/nest-logger.adapter';

const fakeLogger = () => ({
    debug: jest.fn<LoggerService['debug']>(),
    info: jest.fn<LoggerService['info']>(),
    warn: jest.fn<LoggerService['warn']>(),
    error: jest.fn<LoggerService['error']>()
});

/*
 * O log interno do Nest passa pelo nosso logger: mensagens informativas viram debug, avisos viram
 * warn e erros viram error (exceto o erro de subida, que o server.ts já registra).
 */
describe('NestLoggerAdapter', () => {
    let logger: ReturnType<typeof fakeLogger>;
    let adapter: NestLoggerAdapter;

    beforeEach(() => {
        logger = fakeLogger();
        adapter = new NestLoggerAdapter(logger as unknown as LoggerService);
    });

    it('log, debug e verbose viram debug, com o contexto do Nest', () => {
        adapter.log('Mapped {/api/categories, GET} route', 'RouterExplorer');
        adapter.debug('detalhe', 'InstanceLoader');
        adapter.verbose('mais detalhe', 'NestFactory');

        expect(logger.debug.mock.calls).toEqual([
            ['Mapped {/api/categories, GET} route', { context: 'RouterExplorer' }],
            ['detalhe', { context: 'InstanceLoader' }],
            ['mais detalhe', { context: 'NestFactory' }]
        ]);
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('o contexto é o último parâmetro, se for texto', () => {
        adapter.log('sem contexto');
        adapter.log('contexto no fim', { extra: 1 }, 'Primeiro', 'Ultimo');
        adapter.log('último não é texto', 'Texto', 42);

        expect(logger.debug.mock.calls).toEqual([
            ['sem contexto', {}],
            ['contexto no fim', { context: 'Ultimo' }],
            ['último não é texto', {}]
        ]);
    });

    it('mensagens que não são texto: Error vira a mensagem; o resto, JSON', () => {
        adapter.log(new Error('falhou'));
        adapter.log({ rota: '/api' });
        adapter.log(42);
        adapter.log(undefined);

        expect(logger.debug.mock.calls.map(call => call[0])).toEqual(['falhou', '{"rota":"/api"}', '42', 'undefined']);
    });

    it('warn vira warn', () => {
        adapter.warn('cuidado', 'Scanner');

        expect(logger.warn).toHaveBeenCalledWith('cuidado', { context: 'Scanner' });
    });

    describe('error', () => {
        it('error(mensagem, pilha, contexto): leva a pilha e o contexto', () => {
            adapter.error('Falhou', 'Error: Falhou\n    at x', 'RoutesResolver');

            expect(logger.error).toHaveBeenCalledWith('Falhou', { context: 'RoutesResolver', stack: 'Error: Falhou\n    at x' });
        });

        it('error(mensagem, contexto): um só texto é o contexto, não a pilha', () => {
            adapter.error('Falhou', 'RoutesResolver');
            adapter.error('Só a mensagem');

            expect(logger.error.mock.calls).toEqual([
                ['Falhou', { context: 'RoutesResolver' }],
                ['Só a mensagem', {}]
            ]);
        });

        it('error(Error, contexto): nome, mensagem e pilha do erro', () => {
            const error = new RangeError('fora do limite');

            adapter.error(error, 'Scanner');

            expect(logger.error).toHaveBeenCalledWith('fora do limite', {
                context: 'Scanner',
                errorName: 'RangeError',
                errorMessage: 'fora do limite',
                stack: error.stack
            });
        });

        it('a pilha recebida como texto tem prioridade sobre a do Error', () => {
            const error = new Error('x');

            adapter.error(error, 'pilha do Nest', 'Scanner');

            expect(logger.error).toHaveBeenCalledWith('x', expect.objectContaining({ stack: 'pilha do Nest', context: 'Scanner' }));
        });

        it('erro de subida (contexto ExceptionHandler) vai como debug, porque o server.ts já registra a falha', () => {
            adapter.error('Nest can\'t resolve dependencies', 'Error: ...\n    at y', 'ExceptionHandler');

            expect(logger.error).not.toHaveBeenCalled();
            expect(logger.debug).toHaveBeenCalledWith('Nest can\'t resolve dependencies', {
                context: 'ExceptionHandler',
                stack: 'Error: ...\n    at y'
            });
        });

        it('fatal é tratado como error', () => {
            adapter.fatal('Muito grave', 'Bootstrap');
            adapter.fatal('Subida', 'ExceptionHandler');

            expect(logger.error).toHaveBeenCalledWith('Muito grave', { context: 'Bootstrap' });
            expect(logger.debug).toHaveBeenCalledWith('Subida', { context: 'ExceptionHandler' });
        });
    });
});
