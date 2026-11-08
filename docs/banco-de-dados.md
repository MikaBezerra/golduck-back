# Banco de dados

PostgreSQL 18 com [Prisma 7](https://www.prisma.io). O modelo fica em `prisma/schema.prisma`; o client
é gerado em `src/generated/prisma` (`npx prisma generate`, não versionado). O acesso ao banco acontece
só nos `repository/` de cada módulo.

## Tabelas

| Modelo | Para quê | Pontos importantes |
| --- | --- | --- |
| `User` | quem entra no sistema | e-mail único; `role` `ADMIN` ou `USER`; senha com Argon2id (`hash`); `active` |
| `AuthSession` | uma sessão de login | guarda só o hash do refresh token; `expiresAt` (renovado a cada refresh, até 30 dias do login) e `revokedAt` |
| `Person` | quem divide as contas | `active`; e-mail e celular opcionais |
| `Category` | categoria das compras do cartão (as despesas fora do cartão não têm categoria) | `nameKey` único (nome em minúsculas); `isDefault` marca "Outros", a padrão |
| `MonthlyIncome` | entrada de um mês | um registro por mês; valor em centavos |
| `MonthlyReserve` | reserva (valor guardado) de um mês | um registro por mês; valor em centavos |
| `ManualExpense` | despesa fora do cartão | mês, título, valor (sem categoria), `split` (`SHARED` ou `PERSONAL` com `personId`; nunca `PENDING`) e `paidAt` (quando foi marcada como paga) |
| `CreditCard` | cartão | banco (`CardBank`: `NUBANK`, `C6`, `NEON`) e `active`; ciclo da fatura (`dueDay`, `bestPurchaseDay`); ligação com o Meu Pluggy (`pluggyItemId`, `pluggyAccountId`, `syncFromMonth`), situação da última sincronização (`sync*`) e limite informado pelo usuário (`creditLimitCents`) |
| `CardBill` | uma fatura do cartão (mês do vencimento) | único por cartão e mês; melhor dia ajustado pelo usuário (`bestPurchaseDate`) e fechamento/vencimento informados pelo banco (`bankClosingDate`, `bankDueDate`) ([sincronizacao-de-cartoes.md](sincronizacao-de-cartoes.md)); pagamento (`paidAt` e `paidAmountCents`, o total no momento do pagamento) |
| `CardPurchaseCorrection` | correção do usuário: em que fatura cai uma compra | único por cartão e `purchaseKey`; a parcela `installmentNumber` fica em `month` e as outras seguem |
| `CardImport` | um upload de fatura | cartão, mês da fatura, nome e hash do arquivo, versão do parser e contagens |
| `SummaryDispatch` | um envio do resumo do mês por e-mail | `idempotencyKey` único; `runningMonth` único e preenchido só enquanto roda (trava um envio por mês); `status` `RUNNING`, `DONE` ou `INTERRUPTED` ([envio-de-resumos.md](envio-de-resumos.md)) |
| `SummaryDispatchItem` | resultado de uma pessoa num envio | nome no momento do envio, destinatário mascarado, `status` `SENT`, `SKIPPED_NO_EMAIL` ou `FAILED`, código e mensagem |
| `CardExpense` | uma linha da fatura num mês | `purchaseKey` identifica a compra; parcela `n/N`; `sourceMonth` (mês da 1ª parcela); `origin` (`SYNC`, `UPLOAD` ou `MANUAL`) e `externalId` (id da transação na Pluggy); apelido, categoria e `split` (`PENDING`, `SHARED` ou `PERSONAL` com `personId`); exclusão suave (`excludedAt`, `exclusionRemembered`) |

`split` (enum `ExpenseSplit`) tem um `CHECK` em cada tabela de despesa: `personId` preenchido se e só se
`split = 'PERSONAL'` (e, em `ManualExpense`, nunca `PENDING`). O Prisma não descreve `CHECK`: ele está só
na migração `add_expense_split`, que também converteu as linhas antigas (sem pessoa → `SHARED`).

Relações principais: despesas apontam para `Person` e as compras do cartão também para `Category`, com
`onDelete: Restrict` (não dá para apagar pessoa em uso, por isso ela é desativada; a categoria só é
apagada pelo `DELETE /categories/{id}`, que antes passa as compras para "Outros"). A migração
`remove_manual_expense_category` tirou a categoria das despesas fora do cartão. `CardExpense` pode pertencer a
um `CardImport` (`onDelete: Cascade`: apagar o upload apaga as linhas dele); as linhas sincronizadas e as de
"Adicionar compra" não têm upload (`importId` null). `CardBill` e `CardPurchaseCorrection` saem junto com o cartão.

## Convenções

- **IDs** UUID v4 gerados pelo banco (`@default(uuid()) @db.Uuid`).
- **Dinheiro** em centavos, `BigInt` (`amountCents`). Nunca `Decimal`/`Float`.
- **Mês** como `@db.Date` no dia 1 (`2026-11-01`), sempre em UTC.
- **Datas e horas** como `@db.Timestamptz(3)`; `createdAt`/`updatedAt` em todo modelo.
- **Exclusão suave** onde o histórico importa (`CardExpense.excludedAt`); cadastros usam `active`.
- **Índices** para os filtros reais das telas (`[active, name]`, `[cardId, month]`, `[month]`...).
- **Unicidade** garantida no banco (ex.: `[cardId, month, purchaseKey]`); o service confere antes
  para dar um erro claro, e trata a violação do banco (`P2002`) para o caso de duas requisições
  simultâneas.

## Ambientes publicados (Neon)

Develop e produção ficam no mesmo banco do Neon (projeto `Golduck`, região São Paulo, banco
`golduck`), cada um no seu schema:

| Schema | Usuário (dono do schema) | Usado por |
| --- | --- | --- |
| `develop` | `golduck_develop` | API e migrações do ambiente develop |
| `production` | `golduck_production` | API e migrações de produção |

- Os dois usuários foram criados por SQL (não pela tela *Roles* do Neon), para não entrarem no grupo
  `neon_superuser`: cada um só enxerga o próprio schema. O `public` fica vazio e nenhum dos dois cria
  nada nele. O `golduck_owner` é o administrador e não é usado pelas aplicações.
- O schema vem do `?schema=` da URL. O adapter do Postgres ignora esse parâmetro, então o
  `PrismaService` o lê e repassa ao adapter (`databaseSchema` em `common/provider/prisma.provider.ts`);
  o `prisma migrate` já o respeita sozinho.
- A API usa o endereço com pooler (`DATABASE_URL`, host com `-pooler`); as migrações usam a conexão
  direta (`DATABASE_DIRECT_URL`), porque a trava do `prisma migrate` não funciona pelo pooler
  ([ambiente-e-configuracao.md](ambiente-e-configuracao.md)).

## Migrações

```sh
npx prisma migrate dev --name add_alguma_coisa   # cria a migração a partir do schema (local)
npx prisma migrate deploy                         # aplica as pendentes
npm run db:check                                  # banco em dia e schema sem mudança pendente
```

- Toda mudança no `schema.prisma` vem com a migração no mesmo PR. O CI aplica todas as migrações num
  banco vazio e falha se o schema tiver mudança sem migração ([ci-cd-e-versoes.md](ci-cd-e-versoes.md)).
- Migrações já publicadas não são editadas: corrija com uma migração nova.
- Dados obrigatórios (como a categoria "Outros") são criados pela própria migração.
- Nos ambientes publicados, o `deploy.yml` roda `prisma migrate deploy` antes de publicar a API.

## Nos testes

Os testes automatizados não usam banco: os repositórios são trocados por versões em memória e os
testes de repositório conferem as consultas montadas para o Prisma ([testes.md](testes.md)). A
validação das migrações num Postgres de verdade fica no job "Migrações" do CI.
