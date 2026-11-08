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
- **Secret** `VERCEL_TOKEN` e **variables** `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` e `DEPLOY_ENABLED=true`
  quando o deploy estiver pronto.
- **Ruleset** na `develop`: PR obrigatório, só squash e os checks de lint/testes/build, migrações e título
  do PR. O administrador do repositório pode passar por cima (por exemplo, para um force push).
- Na Vercel, o deploy automático por Git fica desligado: quem publica é o `deploy.yml`, depois das
  migrações.

## Dependências

O Dependabot (`.github/dependabot.yml`) abre PRs de atualização; eles passam pelo mesmo CI.
