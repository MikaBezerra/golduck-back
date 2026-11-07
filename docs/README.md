# Documentação do back-end (guia geral)

Esta pasta explica como o back-end do Golduck funciona e como trabalhar nele. Cada arquivo trata de um
tema; este aqui é o mapa. O `README.md` da raiz do repositório tem só o resumo e o "como rodar".

## Por onde começar

1. [arquitetura.md](arquitetura.md): como o código está organizado e o caminho de uma requisição.
2. [ambiente-e-configuracao.md](ambiente-e-configuracao.md): rodar na máquina, variáveis e scripts.
3. [contribuindo.md](contribuindo.md): o fluxo de trabalho e a regra de **toda mudança atualizar
   a documentação e os testes**.

## Todos os documentos

| Documento | Do que trata | Atualize quando... |
| --- | --- | --- |
| [arquitetura.md](arquitetura.md) | camadas de um módulo, `common/`, ciclo da requisição, decisões de projeto | criar um módulo, mudar a organização das pastas ou o ciclo da requisição |
| [ambiente-e-configuracao.md](ambiente-e-configuracao.md) | pré-requisitos, Docker, dotenvx, variáveis de ambiente, scripts do `package.json` | criar/mudar variável de ambiente ou script |
| [banco-de-dados.md](banco-de-dados.md) | Prisma, tabelas e relações, convenções, migrações | mudar o `schema.prisma` ou criar migração |
| [api.md](api.md) | contrato HTTP: rotas, envelope, códigos de erro, validação, paginação, headers, Swagger | criar/mudar rota, DTO, código de erro ou header |
| [autenticacao-e-seguranca.md](autenticacao-e-seguranca.md) | login, sessão em cookie, papéis, limites de tentativas, CSRF, CORS, Helmet | mexer em `auth`, guards, cookie, CORS ou limites |
| [regras-de-negocio.md](regras-de-negocio.md) | dinheiro, mês, entradas, reserva, despesas, cartões, resumo e suas fórmulas | mudar qualquer regra de cálculo ou de cadastro |
| [importacao-de-faturas.md](importacao-de-faturas.md) | upload da fatura, pré-visualização, parcelas, exclusões, parsers por banco | mexer em `card-imports`/`card-expenses` ou adicionar um banco |
| [observabilidade.md](observabilidade.md) | logs, `x-request-id`, rotas de status e versão | mudar logs, níveis ou rotas de status |
| [testes.md](testes.md) | tipos de teste, helpers, cobertura, testes de mutação (Stryker) | mudar a forma de testar, helpers ou metas |
| [ci-cd-e-versoes.md](ci-cd-e-versoes.md) | workflows do GitHub, releases, deploy, configuração do repositório | mudar workflows, deploy ou o fluxo de branches |
| [contribuindo.md](contribuindo.md) | do branch ao merge: commits, PR, checklist e definição de pronto | mudar o processo de trabalho |

## Onde está cada coisa no código

| Pasta / arquivo | Documento |
| --- | --- |
| `src/server.ts`, `src/app.setup.ts` | [arquitetura.md](arquitetura.md), [autenticacao-e-seguranca.md](autenticacao-e-seguranca.md) |
| `src/modules/<módulo>/` | [arquitetura.md](arquitetura.md) e o documento do assunto do módulo |
| `src/modules/auth/`, `common/security/` | [autenticacao-e-seguranca.md](autenticacao-e-seguranca.md) |
| `src/modules/common/logging/` | [observabilidade.md](observabilidade.md) |
| `src/modules/common/http/`, `validation/`, `pagination/`, `swagger/` | [api.md](api.md) |
| `src/modules/common/provider/config.provider.ts` | [ambiente-e-configuracao.md](ambiente-e-configuracao.md) |
| `src/modules/summary/` | [regras-de-negocio.md](regras-de-negocio.md) |
| `src/modules/card-imports/`, `card-expenses/` | [importacao-de-faturas.md](importacao-de-faturas.md) |
| `prisma/` | [banco-de-dados.md](banco-de-dados.md) |
| `src/testing/`, `**/spec/`, `stryker.config.mjs`, `jest.json` | [testes.md](testes.md) |
| `.github/`, `release-please-config.json`, `Dockerfile` | [ci-cd-e-versoes.md](ci-cd-e-versoes.md) |

## Como escrever aqui

- Português, frases curtas, explicando o **porquê** das decisões, não só o quê.
- Um assunto por arquivo. Se um tema crescer demais, divida e acrescente a linha na tabela acima.
- Exemplos reais (requisição, resposta, comando) valem mais que descrições longas.
- A documentação descreve o código **atual**: mudou o comportamento, mude o documento no mesmo PR.
