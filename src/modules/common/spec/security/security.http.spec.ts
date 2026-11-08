import { Controller, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import type { AddressInfo } from 'node:net';

import { dataOf, errorOf, HttpTestApp } from '../../../../testing/http-test-app.js';
import { Public } from '../../../auth/security/auth.decorators.js';
import { CommonModule } from '../../common.module.js';
import { RateLimit, TrustedOrigin } from '../../security/index.js';

/* Rotas só de teste, montadas na API de verdade (configureApp), para ver os headers chegando ao cliente. */
@Controller('teste-seguranca')
class SecurityTestController {
    @Public()
    @RateLimit(2)
    @Get('limitado/:id')
    public limited(@Param('id') id: string): { id: string } {
        return { id };
    }

    @Public()
    @TrustedOrigin()
    @Post('origem')
    @HttpCode(200)
    public origin(): { ok: boolean } {
        return { ok: true };
    }
}

@Module({ imports: [CommonModule], controllers: [SecurityTestController] })
class SecurityTestModule {}

describe('@RateLimit e @TrustedOrigin por HTTP', () => {
    let api: HttpTestApp;

    beforeEach(async () => {
        api = await HttpTestApp.create({ imports: [SecurityTestModule] });
    });

    afterEach(async () => {
        await api.close();
    });

    it('limite por rota: headers x-ratelimit-* em toda resposta e 429 com Retry-After ao estourar', async () => {
        const first = await api.get('/teste-seguranca/limitado/1', { auth: false });
        const second = await api.get('/teste-seguranca/limitado/2', { auth: false });
        const blocked = await api.get('/teste-seguranca/limitado/3', { auth: false });

        expect(first.status).toBe(200);
        expect(dataOf(first)).toEqual({ id: '1' });
        expect(first.headers).toMatchObject({ 'x-ratelimit-limit': '2', 'x-ratelimit-remaining': '1' });
        expect(Number(first.headers['x-ratelimit-reset'])).toBeGreaterThanOrEqual(59);
        expect(Number(first.headers['x-ratelimit-reset'])).toBeLessThanOrEqual(60);
        expect(second.headers['x-ratelimit-remaining']).toBe('0');

        expect(blocked.status).toBe(429);
        expect(errorOf(blocked)).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Aguarde um pouco e tente novamente.' });
        expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(59);
        expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
    });

    it('origem confiável: o front, a própria API (com a porta) e chamadas sem Origin passam; as outras recebem 403', async () => {
        const { port } = api.app.getHttpServer().address() as AddressInfo;
        const post = async (origin?: string): Promise<number> =>
            (await api.post('/teste-seguranca/origem', undefined, { auth: false, headers: origin === undefined ? {} : { origin } })).status;

        expect(await post('https://front.test')).toBe(200);
        expect(await post(`http://127.0.0.1:${port}`)).toBe(200);
        expect(await post()).toBe(200);

        expect(await post(`http://127.0.0.1:${port + 1}`)).toBe(403);
        expect(await post('https://site-malicioso.test')).toBe(403);
        expect(await post('null')).toBe(403);

        const forbidden = await api.post('/teste-seguranca/origem', undefined, { auth: false, headers: { origin: 'https://site-malicioso.test' } });
        expect(errorOf(forbidden)).toMatchObject({ code: 'FORBIDDEN', message: 'Acesso negado' });
    });
});
