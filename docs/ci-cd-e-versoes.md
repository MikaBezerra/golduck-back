# CI/CD e versões

## Workflows (`.github/workflows/`)

| Workflow | Quando roda | O que faz |
| --- | --- | --- |
| `ci.yml` | PR para `develop`/`main` e push nessas branches | lint, valores sensíveis dos `.env` criptografados, tipos (testes inclusive), testes com cobertura mínima e build; migrações aplicadas do zero num Postgres 18 (no schema `develop`, como nos ambientes publicados) e checagem de que o `schema.prisma` não mudou sem migração |
| `pr-title.yml` | abertura e edição de PR | exige título no padrão Conventional Commits (`feat: ...`, `fix: ...`), usado no squash merge |
| `release.yml` | push na `main` | [release-please](https://github.com/googleapis/release-please): PR de release com `CHANGELOG.md` e versão; ao fazer merge, cria a tag `vX.Y.Z` |
| `deploy.yml` | push na `develop` (develop) e na `main` (produção) | job **Migrações**: aplica as migrações no banco do ambiente (sempre roda). Job **Deploy na Vercel**: só depois das migrações e **desligado** até a variável `DEPLOY_ENABLED` ser `true` |

`npm run verify` roda localmente o mesmo que o `ci.yml` (precisa do Postgres no ar para o `db:check`).

## Fluxo e versões

Branch da feature → PR (squash) para `develop` → PR de `develop` para `main` → release-please.
`feat` sobe a versão minor, `fix` sobe a patch e `feat!`/`BREAKING CHANGE` sobe a major.

## Configuração no GitHub

- **Environments** `develop` e `production`, com os secrets `DOTENV_PRIVATE_KEY_DEVELOP` e
  `DOTENV_PRIVATE_KEY_PRODUCTION`; cada um aceita deploy só da sua branch. Se a chave de um `.env`
  mudar (no `.env.keys`), atualize o secret, senão o job de migrações não consegue ler o arquivo.
- **Secret** `VERCEL_TOKEN` e **variables** `VERCEL_ORG_ID` e `DEPLOY_ENABLED=true` (quando o deploy
  estiver pronto) no repositório; **variable** `VERCEL_PROJECT_ID` em cada environment, com o ID do
  projeto da Vercel daquele ambiente.
- **Ruleset** na `develop`: PR obrigatório, só squash e os checks de lint/testes/build, migrações e título
  do PR. O administrador do repositório pode passar por cima (por exemplo, para um force push).
- Na Vercel, o deploy automático por Git fica desligado (`git.deploymentEnabled: false` no
  `vercel.json`): quem publica é o `deploy.yml`, depois das migrações.

## Vercel

| Ambiente | Projeto | Branch | Banco |
| --- | --- | --- | --- |
| develop | `golduck-back-develop` | `develop` | Neon, schema `develop` |
| produção | `golduck-back` | `main` | Neon, schema `production` |

- Um projeto por ambiente, sempre publicado com `--prod`: cada um tem URL fixa
  (`<projeto>.vercel.app`) e escapa da proteção que o plano Hobby põe nos deploys de preview.
- O `vercel.json` usa o preset NestJS (entrada `src/server.ts`), roda `npm ci` e `npm run build` e
  publica a função em São Paulo (`gru1`), perto do banco.
- `SWAGGER_ENABLE=0` nos dois projetos: com o Swagger ligado a API não sobe na Vercel
  ([ambiente-e-configuracao.md](ambiente-e-configuracao.md#variáveis)). O front gera os tipos pela API local.
- O `engines` do `package.json` (`22.x`) manda na versão do Node da Vercel; sem ele, ela escolhe a mais nova.
- As variáveis da API ficam no painel de cada projeto (*Settings > Environment Variables*, ambiente
  *Production*), não no `.env.develop`/`.env.production`: a Vercel não roda o `dotenvx`. Esses
  arquivos continuam valendo para as migrações e o `admin:create:*`. Mudou um valor usado pelos dois
  lados (como a `DATABASE_URL`)? Atualize nos dois. `DATABASE_DIRECT_URL` não vai para a Vercel. O envio do resumo
  por e-mail (`MAIL_*`) só existe no painel da Vercel ([envio-de-resumos.md](envio-de-resumos.md)).
- O front chama a API pelo próprio domínio (rewrite de `/api` no projeto do front), então o cookie de
  sessão é do mesmo site; a `API_CORS_ORIGINS` da API leva o endereço do front, porque o rewrite repassa
  o `Origin` dele ([autenticacao-e-seguranca.md](autenticacao-e-seguranca.md)).

## Dependências

O Dependabot (`.github/dependabot.yml`) abre PRs de atualização; eles passam pelo mesmo CI.
