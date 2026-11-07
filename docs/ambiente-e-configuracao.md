# Ambiente e configuração

## Pré-requisitos

- Node **22.13 ou mais novo** (veja o `.nvmrc`).
- Docker, para o PostgreSQL 18 local.

## Rodando na máquina

```sh
npm ci
cp .env.example .env            # ajuste se precisar
docker compose up -d            # PostgreSQL 18 na porta 5433
npx prisma migrate deploy       # aplica as migrações
npm run admin:create            # cria o primeiro usuário ADMIN (interativo)
npm run dev                     # http://localhost:3000/api
```

- O Postgres do Docker usa a porta **5433** para não conflitar com um PostgreSQL instalado direto na
  máquina.
- Com `SWAGGER_ENABLE=1` no `.env`, a documentação fica em `http://localhost:3000/docs` e o JSON em
  `/docs-json` (o front gera os tipos da API a partir dele).
- O `npm install` liga os hooks do Husky (commitlint no `commit-msg`); veja [contribuindo.md](contribuindo.md).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | sobe a API em modo watch, com o `.env` |
| `npm run build` / `npm start` | compila para `dist/` e roda o build |
| `npm run start:develop` / `start:production` | roda o build com o `.env.develop` / `.env.production` |
| `npm run lint` / `lint:check` | ESLint com correção automática / só verificação |
| `npm run typecheck` | checagem de tipos de todo o código, testes inclusive |
| `npm test` / `test:cov` | testes / testes com cobertura e metas mínimas |
| `npm run test:mutation` | testes de mutação (Stryker); `STRYKER_MUTATE=<pasta>` limita a uma parte ([testes.md](testes.md)) |
| `npm run db:check` | confere se o banco local tem todas as migrações e se o `schema.prisma` não mudou sem migração |
| **`npm run verify`** | **o que o CI roda:** client do Prisma, `lint:check`, `typecheck`, `test:cov`, `build` e `db:check` (precisa do Postgres no ar) |
| `npm run verify:full` | `verify` + testes de mutação do projeto todo (demorado; antes de PR para `main`) |
| `npm run admin:create` | cria um usuário ADMIN |
| `npm run db:migrate:develop` / `db:migrate:production` | aplica as migrações no banco do ambiente |
| `npx prisma migrate dev --name <nome>` | cria uma migração a partir do `schema.prisma` (desenvolvimento) |

## Arquivos de ambiente (dotenvx)

| Arquivo | Para quê | Versionado? |
| --- | --- | --- |
| `.env` | desenvolvimento local, sem criptografia (copie do `.env.example`) | não |
| `.env.example` | modelo do `.env`, com valores de exemplo | sim |
| `.env.develop` | ambiente develop; `DATABASE_URL`, `DATABASE_DIRECT_URL` e `JWT_SECRET` criptografados | sim |
| `.env.production` | produção; `DATABASE_URL`, `DATABASE_DIRECT_URL` e `JWT_SECRET` criptografados | sim |
| `.env.keys` | chaves privadas (`DOTENV_PRIVATE_KEY_DEVELOP` e `..._PRODUCTION`) | **nunca** |

- Guarde uma cópia segura do `.env.keys`: sem ele não é possível ler os valores criptografados.
- Trocar um valor: `npx dotenvx set DATABASE_URL "postgresql://..." -f .env.production` (criptografa
  automaticamente; use `--plain` para valores não sensíveis, como `API_PORT`).
- Ler um valor: `npx dotenvx get DATABASE_URL -f .env.develop`.
- Os testes automatizados não usam nenhum desses arquivos: as variáveis de teste ficam em
  `src/testing/http-test-app.ts`.

## Variáveis

A configuração é validada na subida (`common/provider/config.provider.ts`, com Joi): valor inválido
impede a API de subir, com a mensagem do problema. Sem `DATABASE_URL` válida ou com `JWT_SECRET` abaixo
de 32 caracteres, a API nem sobe.

| Variável | Para quê |
| --- | --- |
| `APP_ENV` | nome do ambiente (`local`, `develop`, `production`...), nos logs e em `/api/version` |
| `API_PORT`, `API_PREFIX` | porta e prefixo das rotas (`/api`) |
| `API_CORS_ORIGINS` | origens do front, separadas por vírgula: liberam o CORS com cookies e são aceitas no login/refresh/logout; vazio desliga o CORS (no local, `http://localhost:4200`) |
| `SWAGGER_ENABLE` | `1` publica `/docs` e `/docs-json` (e desliga a CSP do Helmet, que bloquearia a interface) |
| `TRUST_PROXY` | em quais proxies confiar para obter o IP real: vazio/`false` = nenhum, `true` = todos (Vercel), número de saltos ou IPs/CIDRs |
| `DATABASE_URL` | conexão com o PostgreSQL (obrigatória); `?schema=` escolhe o schema (`public` se ausente). No Neon, é o endereço com pooler |
| `DATABASE_DIRECT_URL` | conexão direta, usada só pelas migrações (`prisma.config.ts`); a API não lê. No Neon, o mesmo endereço sem o `-pooler`. Vazia: as migrações usam a `DATABASE_URL` |
| `JWT_SECRET`, `JWT_ISSUER` | assinatura (mínimo de 32 caracteres) e emissor dos tokens |
| `AUTH_COOKIE_NAME` | nome do cookie do refresh token (padrão `refresh_token`; aqui `golduck_refresh`) |
| `AUTH_COOKIE_SAMESITE` | `strict` (padrão), `lax` ou `none`: quando o navegador envia o cookie em chamadas de outro site |
| `AUTH_COOKIE_DOMAIN` | domínio do cookie; vazio (recomendado) = só o endereço exato da API |
| `LOG_LEVEL` | nível mínimo do log: `error`, `warn`, `info` (padrão) ou `debug` |
| `LOG_FORMAT` | `pretty` ou `json`; vazio = `pretty` com `APP_ENV=local` e `json` nos demais |
| `LOG_REQUEST_BODY` | corpo das requisições no log: `off`, `errors` (padrão, só nas que falharam) ou `all` |
| `SLOW_REQUEST_MS`, `SLOW_QUERY_MS` | a partir de quantos ms a requisição (padrão 1000) / consulta (padrão 500) é lenta |
| `GIT_COMMIT_SHA` | commit publicado (o deploy preenche; na Vercel também vem em `VERCEL_GIT_COMMIT_SHA`) |

Criou ou mudou uma variável? Atualize o `config.provider.ts` (validação), o tipo `Config`, o
`.env.example`, os `.env.develop`/`.env.production` e esta tabela.
