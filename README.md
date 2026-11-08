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

Principais regras (detalhes em [docs/](docs/README.md)):

- **Dinheiro** em centavos (`BIGINT`) que trafega como texto (`"1234.56"`); **mês** como `"AAAA-MM"`.
- **Respostas** em `{ "data": ... }`; erros em `{ "error": { "code", "message", "requestId", "details"? } }`.
- **Líquido por pessoa:** (entrada − compartilhadas − reserva) dividido entre as pessoas ativas, menos as
  despesas individuais de cada uma.
- **Sessão:** access token de 15 min + refresh token rotativo em cookie httpOnly (até 30 dias desde o login).

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

Antes de abrir um PR: `npm run verify` (o mesmo que o CI roda). Scripts, variáveis e Docker em
[docs/ambiente-e-configuracao.md](docs/ambiente-e-configuracao.md).

## Documentação

A pasta [docs/](docs/README.md) explica o projeto por tema, com um guia geral de todos os arquivos:

| Documento | Assunto |
| --- | --- |
| [Guia geral](docs/README.md) | mapa de toda a documentação e de onde cada assunto está no código |
| [Arquitetura](docs/arquitetura.md) | organização dos módulos e o caminho de uma requisição |
| [Ambiente e configuração](docs/ambiente-e-configuracao.md) | rodar na máquina, variáveis (dotenvx) e scripts |
| [Banco de dados](docs/banco-de-dados.md) | Prisma, tabelas, convenções e migrações |
| [API](docs/api.md) | rotas, envelope, códigos de erro, validação, paginação e headers |
| [Autenticação e segurança](docs/autenticacao-e-seguranca.md) | sessão em cookie, papéis, limites de tentativas, CSRF e CORS |
| [Regras de negócio](docs/regras-de-negocio.md) | entradas, reserva, despesas e as fórmulas do resumo |
| [Importação de faturas](docs/importacao-de-faturas.md) | upload, pré-visualização, parcelas e parsers por banco |
| [Observabilidade](docs/observabilidade.md) | logs, `x-request-id`, status e versão |
| [Testes](docs/testes.md) | tipos de teste, helpers e cobertura |
| [CI/CD e versões](docs/ci-cd-e-versoes.md) | workflows, releases e deploy |
| [Contribuindo](docs/contribuindo.md) | fluxo de trabalho e a regra: toda mudança atualiza testes e documentação |

## Créditos

A estrutura inicial veio do [nestjs-template](https://github.com/Saluki/nestjs-template), sob licença MIT
(veja o `LICENSE`).
