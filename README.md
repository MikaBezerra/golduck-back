# Golduck — back-end

API do **Golduck**, um app de finanças pessoais para organizar as contas de uma casa: entradas,
reserva do mês, despesas fora do cartão, faturas de cartão importadas do banco e o resumo do mês e do ano,
com o líquido de cada pessoa. O front-end fica em [golduck-front](https://github.com/MikaBezerra/golduck-front).

## Stack

| Peça | Escolha |
| --- | --- |
| Framework | [NestJS 12](https://nestjs.com) sobre [Fastify 5](https://fastify.dev) |
| Banco | PostgreSQL 18 + [Prisma 7](https://www.prisma.io) (migrações versionadas) |
| Validação | [Joi](https://joi.dev), com mensagens em português |
| Autenticação | JWT de curta duração + refresh token rotativo em cookie httpOnly; senhas com Argon2id |
| Faturas | `csv-parse` (Nubank e C6) e `pdfjs-dist` (Neon, PDF com senha) |
| Documentação | OpenAPI/Swagger em `/docs` e `/docs-json` |
| Testes | Jest em modo ESM (ts-jest) |
| Ambientes | [dotenvx](https://dotenvx.com) com arquivos criptografados por ambiente |

## O que a API faz

| Módulo | Rotas | Para quê |
| --- | --- | --- |
| `auth` | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` | login, renovação (pelo cookie) e encerramento da sessão; usuário logado |
| `people` | `/people` | pessoas que dividem as contas (ativas e inativas) |
| `categories` | `/categories` | categorias de despesa; "Outros" é a padrão |
| `incomes` | `/incomes` | entrada de cada mês (o mesmo valor pode ser lançado em vários meses) |
| `reserves` | `/reserves`, `/reserves/totals` | reserva do mês (quanto foi guardado) e somas anual e histórica |
| `manual-expenses` | `/manual-expenses` | despesas fora do cartão, compartilhadas ou de uma pessoa, com réplica até dezembro |
| `credit-cards` | `/credit-cards` | cartões (Nubank, C6, Neon) |
| `card-imports` | `/card-imports`, `/card-imports/preview`, `/card-imports/manual` | importação da fatura (CSV/PDF ou digitada), pré-visualização, escolhas do usuário e histórico de uploads |
| `card-expenses` | `/card-expenses` | despesas do cartão: apelido, categoria, pessoa, exclusão e restauração |
| `summary` | `/summary`, `/summary/annual` | resumo do mês e do ano: entrada, reserva, despesas, saldo, totais e líquido por pessoa |
| `common` | `/health`, `/health/live`, `/version` | estado da API e do banco (somente ADMIN); "está no ar?" e versão publicada (públicos) |

Regras principais:

- **Dinheiro** é guardado em centavos (`BIGINT`) e trafega como texto (`"1234.56"`); nenhuma conta usa ponto flutuante.
- **Mês** trafega como `"AAAA-MM"` e datas como `"AAAA-MM-DD"`; horários são gravados em UTC.
- **Respostas** vêm em `{ "data": ... }`; erros em `{ "error": { "code", "message", "requestId", "details"? } }`.
- **Listas paginadas** recebem `?page=1&pageSize=20` (máximo 100) e respondem
  `{ "data": { "items", "page", "pageSize", "total", "totalPages" } }`. Peças em `common/pagination`
  (`PageQueryPipe`, `pageQueryKeys` para combinar com outros filtros, `paginate` e `mapPage`) e
  `@ApiPaginatedResponse(Dto)` para o Swagger. As listas atuais do Golduck não são paginadas.
- **Fatura do cartão:** cada upload é absoluto para o mês da fatura; parcelas futuras são projetadas e
  confirmadas pelos uploads seguintes; apelido, categoria e pessoa sobrevivem aos reenvios.
- **Líquido por pessoa:** (entrada − compartilhadas − reserva) dividido entre as pessoas ativas, menos as
  despesas individuais de cada uma.
- **Sessão:** o login devolve o access token (JWT de 15 min, enviado como `Authorization: Bearer`) e grava o
  refresh token (7 dias, uso único) num cookie httpOnly com `Path=/api/auth`. O `/auth/refresh` não tem corpo:
  lê o cookie, gira o token e grava o novo; reusar um token antigo encerra a sessão. O `/auth/logout` encerra a
  sessão do cookie e/ou do Bearer (mesmo vencido), apaga o cookie e sempre responde 204.
- **Segurança:** headers do Helmet; limite de tentativas por IP no login (5/min) e no refresh (20/min), com
  `429 TOO_MANY_REQUESTS` e o header `Retry-After` (`@RateLimit()`); contra CSRF, login, refresh e logout recusam
  com `403 FORBIDDEN` um header `Origin` que não seja o front (`API_CORS_ORIGINS`) nem a própria API; a configuração é validada na subida (sem `DATABASE_URL`
  válida ou com `JWT_SECRET` abaixo de 32 caracteres, a API nem sobe).

## Como rodar

Pré-requisitos: Node **22.13 ou mais novo** (veja o `.nvmrc`) e Docker.

```sh
npm ci
cp .env.example .env            # ajuste se precisar
docker compose up -d            # PostgreSQL 18 na porta 5433
npx prisma migrate deploy       # aplica as migrações
npm run admin:create            # cria o primeiro usuário ADMIN (interativo)
npm run dev                     # http://localhost:3000/api
```

Com `SWAGGER_ENABLE=1` no `.env`, a documentação fica em `http://localhost:3000/docs` e o JSON em `/docs-json`
(o front gera os tipos da API a partir dele).

O Postgres do Docker usa a porta **5433** para não conflitar com um PostgreSQL instalado direto na máquina.

## Logs

Cada requisição gera **uma linha de log** ao final da resposta; também são registrados a subida da API,
consultas lentas ao banco e erros fora de requisição.

- **Formato:** `pretty` no local (legível, colorido) e `json` nos ambientes publicados (uma linha por evento),
  com `service`, `version`, `commit` e `env` em toda linha.
- **Em cada requisição:** `requestId`, método, rota e caminho, query, status, duração, IP, user agent, usuário
  (id, e-mail e papel), código e motivo do erro, detalhes da validação, pilha (5xx) e, conforme
  `LOG_REQUEST_BODY`, o corpo.
- **Níveis:** 5xx = `error`; 4xx (exceto 401) e requisições lentas (`SLOW_REQUEST_MS`) = `warn`; o resto = `info`.
  Rotas marcadas com `@QuietRequestLog()` (ex.: `/health/live`) ficam em `debug`.
- **Privacidade:** senha, tokens, segredos, cookies e `authorization` aparecem como `[oculto]`; textos e listas
  longos são encurtados (até ~4 KB por valor); uploads nunca são registrados; os parâmetros do SQL ficam de fora.
- **Correlação:** toda resposta traz `x-request-id` (reaproveita o que o cliente enviar, se for válido) e
  `x-app-version`; o mesmo id vem no corpo dos erros.
- **Banco:** consultas acima de `SLOW_QUERY_MS` viram `warn` com o SQL; com `LOG_LEVEL=debug` aparecem todas as
  consultas e o log interno do Nest.
- **Processo:** falha na subida, promise rejeitada sem tratamento e exceção não tratada também vão para o log.

```text
[API] 1234 - 07/11 13:24:06  INFO  API no ar  port=3000  prefix=/api  env=local  version=0.1.0  swagger=/docs
[API] 1234 - 07/11 13:24:09  WARN   POST   /api/auth/login  400 +4ms  [ca9d9885]
    ↳ VALIDATION_ERROR
    ↳ detalhes: [{"field":"email","code":"string.email","message":"email deve conter um e-mail válido"}]
    ↳ corpo: {"email":"nao-e-email","password":"[oculto]"}
```

Rotas públicas de status: `GET /api/health/live` (para monitor de disponibilidade; não consulta o banco) e
`GET /api/version` (nome, versão, commit e ambiente). `GET /api/health`, que consulta o banco, é só para ADMIN.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | sobe a API em modo watch, com o `.env` |
| `npm run build` / `npm start` | compila para `dist/` e roda o build |
| `npm run start:develop` / `start:production` | roda o build com o `.env.develop` / `.env.production` |
| `npm run lint` / `lint:check` | ESLint com correção automática / só verificação |
| `npm run typecheck` | checagem de tipos sem gerar arquivos |
| `npm test` / `test:cov` | testes / testes com cobertura e metas mínimas |
| `npm run db:check` | confere se o banco local tem todas as migrações e se o `schema.prisma` não mudou sem migração |
| **`npm run verify`** | **roda localmente o que o CI roda:** `lint:check`, `typecheck`, `test:cov`, `build` e `db:check` (precisa do Postgres no ar) |
| `npm run admin:create` | cria um usuário ADMIN |
| `npm run db:migrate:develop` / `db:migrate:production` | aplica as migrações no banco do ambiente |
| `npx prisma migrate dev --name <nome>` | cria uma migração a partir do `schema.prisma` (desenvolvimento) |

## Commits

O `npm install` liga os hooks do [Husky](https://typicode.github.io/husky/). O hook `commit-msg` passa a mensagem
pelo [commitlint](https://commitlint.js.org/) no padrão Conventional Commits (`feat: ...`, `fix: ...`,
`chore: ...`, `docs: ...`, `ci: ...`), o mesmo do título do PR e do `CHANGELOG.md`. Antes de commitar ou abrir PR,
rode `npm run verify`.

## Estrutura

```text
src/
  server.ts                 bootstrap (Fastify, Helmet, CORS, multipart, Swagger, logs)
  modules/
    app.module.ts
    common/                 configuração, Prisma, logs, erros, respostas, validação, Swagger, datas e dinheiro
    <módulo>/
      controller/           rotas HTTP e documentação OpenAPI
      dto/                  formatos de entrada e de resposta
      flow/                 pipes de validação (Joi)
      errors/               erros do módulo (AppError com código próprio)
      repository/           acesso ao banco (Prisma)
      service/              regras de negócio
      spec/                 testes
prisma/
  schema.prisma
  migrations/
```

## Ambientes e variáveis (dotenvx)

| Arquivo | Para quê | Versionado? |
| --- | --- | --- |
| `.env` | desenvolvimento local, sem criptografia (copie do `.env.example`) | não |
| `.env.example` | modelo do `.env`, com valores de exemplo | sim |
| `.env.develop` | ambiente develop; `DATABASE_URL` e `JWT_SECRET` criptografados | sim |
| `.env.production` | produção; `DATABASE_URL` e `JWT_SECRET` criptografados | sim |
| `.env.keys` | chaves privadas (`DOTENV_PRIVATE_KEY_DEVELOP` e `..._PRODUCTION`) | **nunca** |

- Guarde uma cópia segura do `.env.keys`: sem ele não é possível ler os valores criptografados.
- Trocar um valor: `npx dotenvx set DATABASE_URL "postgresql://..." -f .env.production` (criptografa
  automaticamente; use `--plain` para valores não sensíveis, como `API_PORT`).
- Ler um valor: `npx dotenvx get DATABASE_URL -f .env.develop`.

| Variável | Para quê |
| --- | --- |
| `APP_ENV` | nome do ambiente (`local`, `develop`, `production`...), nos logs e em `/api/version` |
| `API_PORT`, `API_PREFIX` | porta e prefixo das rotas (`/api`) |
| `API_CORS_ORIGINS` | origens do front, separadas por vírgula: liberam o CORS com cookies e são aceitas no login/refresh/logout; vazio desliga o CORS (no local, `http://localhost:4200`) |
| `SWAGGER_ENABLE` | `1` publica `/docs` e `/docs-json` (e desliga a CSP do Helmet, que bloquearia a interface) |
| `TRUST_PROXY` | em quais proxies confiar para obter o IP real: vazio/`false` = nenhum, `true` = todos (Vercel), número de saltos ou IPs/CIDRs |
| `DATABASE_URL` | conexão com o PostgreSQL (obrigatória) |
| `JWT_SECRET`, `JWT_ISSUER` | assinatura (mínimo de 32 caracteres) e emissor dos tokens |
| `AUTH_COOKIE_NAME` | nome do cookie do refresh token (padrão `refresh_token`; aqui `golduck_refresh`) |
| `AUTH_COOKIE_SAMESITE` | `strict` (padrão), `lax` ou `none`: quando o navegador envia o cookie em chamadas de outro site |
| `AUTH_COOKIE_DOMAIN` | domínio do cookie; vazio (recomendado) = só o endereço exato da API |
| `LOG_LEVEL` | nível mínimo do log: `error`, `warn`, `info` (padrão) ou `debug` |
| `LOG_FORMAT` | `pretty` ou `json`; vazio = `pretty` com `APP_ENV=local` e `json` nos demais |
| `LOG_REQUEST_BODY` | corpo das requisições no log: `off`, `errors` (padrão, só nas que falharam) ou `all` |
| `SLOW_REQUEST_MS`, `SLOW_QUERY_MS` | a partir de quantos ms a requisição (padrão 1000) / consulta (padrão 500) é lenta |
| `GIT_COMMIT_SHA` | commit publicado (o deploy preenche; na Vercel também vem em `VERCEL_GIT_COMMIT_SHA`) |

> **Deploy e cookie:** com front e API em domínios `*.vercel.app` diferentes, o navegador trata o cookie como de
> outro site e o Safari o bloqueia. Em produção, use domínio próprio (API num subdomínio, ex.: `api.golduck.com.br`)
> ou sirva a API em `/api` no domínio do front.

## CI/CD e versões

| Workflow | Quando roda | O que faz |
| --- | --- | --- |
| `ci.yml` | PR para `develop`/`main` e push nessas branches | lint, tipos, testes com cobertura mínima e build; migrações aplicadas do zero num Postgres 18 e checagem de que o `schema.prisma` não mudou sem migração |
| `pr-title.yml` | abertura e edição de PR | exige título no padrão Conventional Commits (`feat: ...`, `fix: ...`), usado no squash merge |
| `release.yml` | push na `main` | [release-please](https://github.com/googleapis/release-please): PR de release com `CHANGELOG.md` e versão; ao fazer merge, cria a tag `vX.Y.Z` |
| `deploy.yml` | push na `develop` (develop) e na `main` (produção) | aplica as migrações no banco do ambiente e publica na Vercel. **Desligado** até a variável `DEPLOY_ENABLED` ser `true` |

Fluxo: branch da feature → PR (squash) para `develop` → PR de `develop` para `main` → release-please.
`feat` sobe a versão minor, `fix` sobe a patch e `feat!`/`BREAKING CHANGE` sobe a major.

Configuração no GitHub:

- **Environments** `develop` e `production`, com os secrets `DOTENV_PRIVATE_KEY_DEVELOP` e
  `DOTENV_PRIVATE_KEY_PRODUCTION`; cada um aceita deploy só da sua branch.
- **Secret** `VERCEL_TOKEN` e **variables** `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` e `DEPLOY_ENABLED=true`
  quando o deploy estiver pronto.
- **Ruleset** na `develop`: PR obrigatório, só squash e os checks de lint/testes/build, migrações e título
  do PR. O administrador do repositório pode passar por cima (por exemplo, para um force push).
- Na Vercel, o deploy automático por Git fica desligado: quem publica é o `deploy.yml`, depois das migrações.

## Créditos

A estrutura inicial veio do [nestjs-template](https://github.com/Saluki/nestjs-template), sob licença MIT
(veja o `LICENSE`).
