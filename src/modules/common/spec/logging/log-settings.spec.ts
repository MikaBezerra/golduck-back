import { LOG_FORMATS, LOG_LEVELS, LOG_REQUEST_BODY_MODES, readLogSettings } from '../../logging/log-settings';

/*
 * As variáveis LOG_* são lidas antes de o Nest subir, por isso valores errados não derrubam a API:
 * caem no padrão (a validação estrita fica no config.provider).
 */
describe('readLogSettings', () => {
    it('lista os valores aceitos', () => {
        expect(LOG_LEVELS).toEqual(['error', 'warn', 'info', 'debug']);
        expect(LOG_FORMATS).toEqual(['pretty', 'json']);
        expect(LOG_REQUEST_BODY_MODES).toEqual(['off', 'errors', 'all']);
    });

    it('sem variáveis: info, pretty (ambiente local), corpo só nas falhas, 1000 ms e 500 ms, sem silenciar', () => {
        expect(readLogSettings({})).toEqual({
            level: 'info',
            format: 'pretty',
            requestBody: 'errors',
            slowRequestMs: 1000,
            slowQueryMs: 500,
            silent: false
        });
    });

    it('usa os valores informados', () => {
        expect(readLogSettings({
            APP_ENV: 'local',
            LOG_LEVEL: 'debug',
            LOG_FORMAT: 'json',
            LOG_REQUEST_BODY: 'all',
            SLOW_REQUEST_MS: '2500',
            SLOW_QUERY_MS: '0'
        })).toEqual({
            level: 'debug',
            format: 'json',
            requestBody: 'all',
            slowRequestMs: 2500,
            slowQueryMs: 0,
            silent: false
        });
        expect(readLogSettings({ LOG_LEVEL: 'error', LOG_REQUEST_BODY: 'off' })).toMatchObject({ level: 'error', requestBody: 'off' });
        expect(readLogSettings({ LOG_LEVEL: 'warn', LOG_FORMAT: 'pretty', APP_ENV: 'production' })).toMatchObject({ level: 'warn', format: 'pretty' });
    });

    it('formato padrão: pretty no ambiente local (ou sem APP_ENV), json nos demais', () => {
        expect(readLogSettings({ APP_ENV: '' }).format).toBe('pretty');
        expect(readLogSettings({ APP_ENV: 'local' }).format).toBe('pretty');
        expect(readLogSettings({ APP_ENV: 'develop' }).format).toBe('json');
        expect(readLogSettings({ APP_ENV: 'production' }).format).toBe('json');
    });

    it('valores desconhecidos caem no padrão, sem lançar erro', () => {
        expect(readLogSettings({
            APP_ENV: 'production',
            LOG_LEVEL: 'verbose',
            LOG_FORMAT: 'xml',
            LOG_REQUEST_BODY: 'sempre'
        })).toMatchObject({ level: 'info', format: 'json', requestBody: 'errors' });
        expect(readLogSettings({ LOG_LEVEL: 'INFO' }).level).toBe('info');
        expect(readLogSettings({ LOG_LEVEL: '' }).level).toBe('info');
    });

    it('tempos aceitam só inteiros não negativos; o resto cai no padrão', () => {
        for (const invalid of ['', '-1', '1.5', 'abc', '12abc', 'abc12', ' 10']) {
            expect(readLogSettings({ SLOW_REQUEST_MS: invalid, SLOW_QUERY_MS: invalid })).toMatchObject({ slowRequestMs: 1000, slowQueryMs: 500 });
        }

        expect(readLogSettings({ SLOW_REQUEST_MS: '0', SLOW_QUERY_MS: '1500' })).toMatchObject({ slowRequestMs: 0, slowQueryMs: 1500 });
    });

    it('silencia o log só nos testes automatizados (NODE_ENV=test)', () => {
        expect(readLogSettings({ NODE_ENV: 'test' }).silent).toBe(true);
        expect(readLogSettings({ NODE_ENV: 'production' }).silent).toBe(false);
        expect(readLogSettings({ NODE_ENV: 'development' }).silent).toBe(false);
    });

    it('sem parâmetro, lê o process.env', () => {
        const original = process.env;
        process.env = { NODE_ENV: 'test', APP_ENV: 'develop', LOG_LEVEL: 'warn', SLOW_QUERY_MS: '250' };

        try {
            expect(readLogSettings()).toEqual({
                level: 'warn',
                format: 'json',
                requestBody: 'errors',
                slowRequestMs: 1000,
                slowQueryMs: 250,
                silent: true
            });
        } finally {
            process.env = original;
        }
    });
});
