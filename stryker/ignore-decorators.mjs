import { declareValuePlugin, PluginKind } from '@stryker-mutator/api/plugin';

/**
 * Não muta o que está dentro de decorators (`@ApiProperty({ example })`, `@Controller('rota')`,
 * `@RateLimit(5)`...). Quase tudo ali é metadado do Swagger ou do Nest; o comportamento que importa
 * (rotas, limites, validação) é conferido pelos testes HTTP, não mutante a mutante.
 */
export const strykerPlugins = [
    declareValuePlugin(PluginKind.Ignore, 'decorators', {
        shouldIgnore(path) {
            return path.isDecorator() ? 'Metadados de decorator (Nest/Swagger)' : undefined;
        },
    }),
];
