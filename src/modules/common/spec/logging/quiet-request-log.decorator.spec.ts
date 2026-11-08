import { Reflector } from '@nestjs/core';
import { FASTIFY_ROUTE_CONFIG_METADATA } from '@nestjs/platform-fastify/constants';

import { QUIET_REQUEST_LOG, QuietRequestLog } from '../../logging/quiet-request-log.decorator.js';

class HealthLikeController {
    @QuietRequestLog()
    public live(): string {
        return 'ok';
    }

    public normal(): string {
        return 'ok';
    }
}

/** A marca vai na configuração da rota do Fastify, onde o log de requisições procura. */
describe('QuietRequestLog', () => {
    it('marca a rota com quietRequestLog=true na configuração do Fastify', () => {
        const reflector = new Reflector();

        expect(QUIET_REQUEST_LOG).toBe('quietRequestLog');
        /* eslint-disable @typescript-eslint/unbound-method -- o Reflector só lê o metadado gravado na função, sem chamá-la */
        expect(reflector.get(FASTIFY_ROUTE_CONFIG_METADATA, HealthLikeController.prototype.live)).toEqual({ quietRequestLog: true });
        expect(reflector.get(FASTIFY_ROUTE_CONFIG_METADATA, HealthLikeController.prototype.normal)).toBeUndefined();
        /* eslint-enable @typescript-eslint/unbound-method */
    });
});
