# Testes

Jest 30 em modo ESM (ts-jest). Os testes ficam na pasta `spec/` de cada módulo
(`src/modules/<módulo>/spec/*.spec.ts`) e nunca usam banco nem os arquivos `.env`.

```sh
npm test            # todos os testes
npm run test:cov    # com cobertura e metas mínimas (o CI roda este)
```

Rodar só um arquivo ou pasta, sem gerar o client do Prisma de novo:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js --config=jest.json src/modules/people
```

## Tipos de teste

| Tipo | O que confere | Como | Exemplo |
| --- | --- | --- | --- |
| **Funções puras** | contas e regras sem estado | chama a função com entradas e confere a saída | `summary/spec/summary.calculator.spec.ts`, `card-imports/spec/card-import.planner.spec.ts` |
| **Service** | regras de negócio | service real + repositório **em memória** (`spec/in-memory-*.repository.ts`) | `categories/spec/category.service.spec.ts` |
| **HTTP** | rota de ponta a ponta: login, validação, status, envelope, erros | `HttpTestApp` (API montada como em produção, repositórios em memória) | `categories/spec/category.controller.spec.ts` |
| **Repository** | a consulta montada para o Prisma (filtros, ordenação, transações) | repositório real + Prisma falso (`jest.fn`), conferindo os argumentos | `categories/spec/category.repository.spec.ts` |

### Helpers (`src/testing/`)

- `http-test-app.ts`: `HttpTestApp.create({ imports: [XModule], overrides: [{ provide: XRepository,
  useValue: fake }], role? })` sobe a API numa porta livre de `127.0.0.1`, com o `AuthModule` (guards
  globais), as variáveis de teste (`TEST_ENV`) e um usuário de teste já logado. `api.get/post/patch/delete`,
  `dataOf(res)` e `errorOf(res)`.
- O `PrismaService` vira um objeto vazio: qualquer acesso ao banco que escape do fake falha na hora.

### Boas práticas

- Nome do teste em português, dizendo o comportamento: "recusa nome repetido sem diferenciar
  maiúsculas".
- Confira o **comportamento**, não a implementação: status, `code`, `message`, dados gravados.
  Exceção: nos testes de repositório, os argumentos do Prisma *são* o comportamento.
- Erros de negócio: confira `code`, `statusCode` e o `reason` (que vai para o log).
- Teste os limites: 120 caracteres passa e 121 não; mês `13` é inválido; valor com 3 casas é inválido.
- Prove o que **não** aconteceu quando importa (`jest.spyOn(repo, 'create')` + `not.toHaveBeenCalled()`).
- Datas fixas; para "agora", `jest.useFakeTimers({ now })` ou o parâmetro `now` que o código aceitar.
- `import { jest } from '@jest/globals'` (em ESM o objeto `jest` não é global).
- Imports relativos com `.js`, como no código ([arquitetura.md](arquitetura.md#módulos-esm)); o
  `moduleNameMapper` do `jest.json` tira a extensão para o Jest achar o `.ts`. Vale também para
  `jest.unstable_mockModule('../x.js', ...)` e `await import('../x.js')`.
- Arquivos de exemplo (faturas) sempre anonimizados.

## Cobertura

O `npm run test:cov` falha se a cobertura cair abaixo das metas do `jest.json`
(`coverageThreshold`): uma meta global (hoje 96% das linhas e 86% dos branches) e metas próprias para os arquivos de cálculo. As metas só
sobem: quando a cobertura aumentar, suba a meta junto (deixe uma folga pequena, de 1 a 2 pontos).
O relatório fica em `coverage/` (no CI, como artefato).

Fora da cobertura: `src/generated/`, os próprios testes (`spec/`, `src/testing/`).

## Toda mudança vem com testes

Regra do projeto ([contribuindo.md](contribuindo.md)): código novo ou alterado vem com testes no mesmo
PR e a cobertura não pode cair. Guia rápido:

| Mudou... | Teste |
| --- | --- |
| regra de cálculo | função pura (casos normais, limites, centavos) |
| service | service com repositório em memória (sucesso e cada erro, com `reason`) |
| rota, DTO ou pipe | HTTP (status, validação, campos extras, envelope) |
| consulta no repository | repository com Prisma falso (argumentos exatos) |
| bug | primeiro um teste que reproduz o bug (falha), depois a correção |
