import type { AppInfo } from '../../logging/app-info.js';
import { jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV_KEYS = ['APP_ENV', 'GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA', 'npm_package_name', 'npm_package_version'] as const;

/*
 * getAppInfo guarda o resultado na primeira chamada; cada teste carrega uma cópia nova do módulo
 * (isolateModulesAsync) e roda a partir de uma pasta temporária com o package.json do caso.
 */
describe('getAppInfo', () => {
    const originalEnv = process.env;
    let folder: string;

    /** Carrega uma cópia nova do módulo e devolve o resultado das duas primeiras chamadas. */
    const loadAppInfo = async (): Promise<[AppInfo, AppInfo]> => {
        let calls: [AppInfo, AppInfo] | undefined;

        await jest.isolateModulesAsync(async () => {
            const { getAppInfo } = await import('../../logging/app-info.js');
            calls = [getAppInfo(), getAppInfo()];
        });

        if (!calls) {
            throw new Error('módulo não carregado');
        }

        return calls;
    };

    const writePackageJson = (content: string): void => {
        writeFileSync(join(folder, 'package.json'), content);
    };

    beforeEach(() => {
        process.env = { ...originalEnv };
        for (const key of ENV_KEYS) {
            Reflect.deleteProperty(process.env, key);
        }

        folder = mkdtempSync(join(tmpdir(), 'golduck-app-info-'));
        jest.spyOn(process, 'cwd').mockReturnValue(folder);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        process.env = originalEnv;
        rmSync(folder, { recursive: true, force: true });
    });

    it('lê nome e versão do package.json da pasta onde a API foi iniciada e guarda o resultado', async () => {
        writePackageJson(JSON.stringify({ name: 'golduck-back', version: '1.2.3' }));
        process.env.APP_ENV = 'production';

        const [first, second] = await loadAppInfo();

        expect(first).toEqual({ name: 'golduck-back', version: '1.2.3', commit: null, environment: 'production' });
        expect(second).toBe(first);
    });

    it('sem nome/versão no package.json, usa as variáveis do npm', async () => {
        writePackageJson('{}');
        process.env.npm_package_name = 'pelo-npm';
        process.env.npm_package_version = '9.9.9';

        const [info] = await loadAppInfo();

        expect(info).toMatchObject({ name: 'pelo-npm', version: '9.9.9' });
    });

    it('sem package.json legível nem variáveis do npm: "api", "0.0.0" e ambiente local', async () => {
        writePackageJson('isto não é JSON');
        process.env.APP_ENV = '';

        const [info] = await loadAppInfo();

        expect(info).toEqual({ name: 'api', version: '0.0.0', commit: null, environment: 'local' });
    });

    it('sem package.json na pasta também cai nos padrões', async () => {
        const [info] = await loadAppInfo();

        expect(info).toEqual({ name: 'api', version: '0.0.0', commit: null, environment: 'local' });
    });

    it('commit: GIT_COMMIT_SHA tem prioridade e vira os 7 primeiros caracteres, sem espaços', async () => {
        process.env.GIT_COMMIT_SHA = '  abcdef1234567890  ';
        process.env.VERCEL_GIT_COMMIT_SHA = '1111111111';
        process.env.GITHUB_SHA = '2222222222';

        const [info] = await loadAppInfo();

        expect(info.commit).toBe('abcdef1');
    });

    it('commit: depois o da Vercel e por fim o do GitHub Actions', async () => {
        process.env.GIT_COMMIT_SHA = '';
        process.env.VERCEL_GIT_COMMIT_SHA = '1111111aaaa';
        process.env.GITHUB_SHA = '2222222bbbb';
        const [vercel] = await loadAppInfo();

        delete process.env.VERCEL_GIT_COMMIT_SHA;
        const [github] = await loadAppInfo();

        expect(vercel.commit).toBe('1111111');
        expect(github.commit).toBe('2222222');
    });
});
