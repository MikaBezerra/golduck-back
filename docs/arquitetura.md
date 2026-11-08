# Arquitetura

API REST em [NestJS 12](https://nestjs.com) sobre [Fastify 5](https://fastify.dev), com
[Prisma 7](https://www.prisma.io) e PostgreSQL 18. Cada assunto do domínio é um módulo do Nest.

## Módulos ESM

O projeto é ESM (`"type": "module"`, `module: nodenext`), como o NestJS 12, que só existe em ESM. A
Vercel não carrega pacotes ESM a partir de código CommonJS, então essa escolha não é opcional.

- Imports relativos levam a extensão `.js`, mesmo vindo de um `.ts`: `import { X } from './x.js'`
  (pasta com `index.ts`: `'./pasta/index.js'`). O TypeScript confere.
- Pacotes CommonJS sem exports nomeados entram pelo default: `import Joi from 'joi'` (o mesmo para
  `jsonwebtoken`, `argon2` e `winston`). `import * as Joi` compila, mas quebra ao rodar.
- O client do Prisma é gerado em ESM (`moduleFormat = "esm"` no `schema.prisma`).

## Pastas

```text
src/
  server.ts                 sobe a API: cria a app, chama o configureApp e escuta a porta
  app.setup.ts              plugins do Fastify (Helmet, cookie, multipart), CORS, prefixo, Swagger e logs
  testing/                  helpers só de teste (veja testes.md); fora do build
  generated/prisma/         client do Prisma (gerado por `prisma generate`, não versionado)
  modules/
    app.module.ts           junta todos os módulos
    tokens.ts               tokens de injeção (ex.: Service.CONFIG)
    common/                 o que todos os módulos usam (veja abaixo)
    <módulo>/
      <módulo>.module.ts    declara controller, providers e o que exporta
      controller/           rotas HTTP e documentação OpenAPI (decorators do Swagger)
      dto/                  formatos de entrada e de resposta (classes com @ApiProperty)
      flow/                 pipes de validação (Joi) de body, query e params
      errors/               erros do módulo: AppError com código próprio (ex.: CATEGORY_NOT_FOUND)
      repository/           acesso ao banco (Prisma); nenhuma regra de negócio
      service/              regras de negócio; funções puras de cálculo em arquivos próprios
      spec/                 testes do módulo (e fakes usados por eles)
prisma/
  schema.prisma             modelo do banco
  migrations/               migrações versionadas
docs/                       esta documentação
```

Módulos: `auth`, `people`, `categories`, `incomes`, `reserves`, `manual-expenses`, `credit-cards`,
`card-imports`, `card-expenses`, `summary` e `common`. As rotas de cada um estão em [api.md](api.md).

### `common/`

| Pasta | Para quê |
| --- | --- |
| `controller/` | `/health`, `/health/live` e `/version` |
| `date/`, `money/` | mês `"AAAA-MM"` e dinheiro em centavos (`bigint`) |
| `errors/` | `AppError` (código, status, mensagem pública, motivo para o log, headers) e o catálogo de erros genéricos |
| `http/` | filtro global de exceções (envelope `{ error }`) e interceptor de resposta (envelope `{ data }`) |
| `logging/` | logs de requisição, formato `pretty`/`json`, `x-request-id`, ocultação de dados sensíveis |
| `model/` | o tipo `Config` (variáveis de ambiente já validadas) |
| `pagination/` | paginação padrão (`page`, `pageSize`) |
| `provider/` | configuração (validada com Joi na subida), Prisma, logger e confiança em proxies |
| `security/` | `@RateLimit()` e `@TrustedOrigin()` |
| `swagger/` | decorators de documentação (`@ApiDataResponse`, `@ApiErrorResponses`...) e montagem do `/docs` |
| `validation/` | pipe base de validação Joi com mensagens em português |

## Caminho de uma requisição

```text
Fastify (Helmet, CORS, cookie, x-request-id)
  → guards globais: JwtAuthGuard (token + sessão) e RolesGuard (papel)
  → guards da rota: RateLimitGuard, TrustedOriginGuard (quando a rota usa)
  → pipes (flow/): validam e convertem body, query e params (Joi) → 400 VALIDATION_ERROR
  → controller: só repassa ao service
  → service: regras de negócio; lança AppError do módulo
  → repository: Prisma
  → interceptor de resposta: { data: ... }
  → filtro de exceções (se algo falhou): { error: { code, message, requestId, details? } }
  → log da requisição (uma linha, ao final)
```

Toda rota exige login por padrão. Rotas abertas usam `@Public()`; o papel mínimo vem de `@Roles(...)`
(ADMIN passa em todas).

## Decisões de projeto

- **Camadas finas e previsíveis.** Controller não tem regra; repository não tem regra; o service
  decide. Contas complexas ficam em funções puras (`summary.calculator.ts`, `card-import.planner.ts`),
  fáceis de testar sem banco.
- **Erros com código.** Todo erro de negócio é um `AppError` com código estável (o front decide a
  mensagem por ele) e um `reason` interno que só vai para o log.
- **Validação na borda.** Os pipes Joi recusam campos desconhecidos (`unknown(false)`), então o service
  recebe dados já no formato do DTO.
- **Dinheiro em centavos.** `BIGINT` no banco, `bigint` no código e texto (`"1234.56"`) na API; nada de
  ponto flutuante. Veja [regras-de-negocio.md](regras-de-negocio.md).
- **Mesma montagem em produção e nos testes.** `configureApp` é usado pelo `server.ts` e pelo helper de
  testes HTTP, então os testes passam pelos mesmos plugins, guards, filtros e logs.

## Criando um módulo novo

1. Pasta `src/modules/<nome>/` com as subpastas acima e o `<nome>.module.ts` importado no
   `app.module.ts`.
2. Modelo no `schema.prisma` + migração ([banco-de-dados.md](banco-de-dados.md)).
3. DTOs com `@ApiProperty`, pipes Joi, erros do módulo, service e repository.
4. Testes em `spec/`: service, HTTP e repository ([testes.md](testes.md)).
5. Documentação: rotas em [api.md](api.md), regras em [regras-de-negocio.md](regras-de-negocio.md) e
   a linha do módulo no README da raiz.
