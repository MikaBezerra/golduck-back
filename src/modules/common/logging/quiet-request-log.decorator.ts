import { RouteConfig } from '@nestjs/platform-fastify';

export const QUIET_REQUEST_LOG = 'quietRequestLog';

/**
 * Registra as respostas de sucesso da rota em nível debug, e não info.
 * Para rotas chamadas o tempo todo (ex.: health check de monitor), que só poluiriam o log.
 * Falhas e lentidão continuam aparecendo como warn/error.
 */
export function QuietRequestLog(): MethodDecorator & ClassDecorator {
    return RouteConfig({ [QUIET_REQUEST_LOG]: true });
}
