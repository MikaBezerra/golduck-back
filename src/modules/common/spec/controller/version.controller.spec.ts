import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dataOf, HttpTestApp } from '../../../../testing/http-test-app.js';
import { getAppInfo } from '../../logging/app-info.js';

/** GET /version: público, com nome e versão do package.json, commit e ambiente. */
describe('rota /version', () => {
    let api: HttpTestApp;

    beforeAll(async () => {
        api = await HttpTestApp.create({ imports: [] });
    });

    afterAll(async () => {
        await api.close();
    });

    it('é pública e devolve nome, versão, commit e ambiente da API', async () => {
        const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { name: string; version: string };

        const response = await api.get('/version', { auth: false });

        expect(response.status).toBe(200);
        expect(dataOf(response)).toEqual({
            name: packageJson.name,
            version: packageJson.version,
            commit: getAppInfo().commit,
            environment: 'test'
        });
        expect(response.headers['x-app-version']).toBe(packageJson.version);
    });
});
