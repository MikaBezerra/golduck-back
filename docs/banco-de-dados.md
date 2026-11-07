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
| `Category` | categoria de despesa | `nameKey` único (nome em minúsculas); `isDefault` marca "Outros", a padrão |
| `MonthlyIncome` | entrada de um mês | um registro por mês; valor em centavos |
| `MonthlyReserve` | reserva (valor guardado) de um mês | um registro por mês; valor em centavos |
| `ManualExpense` | despesa fora do cartão | mês, título, valor, categoria e pessoa opcional (sem pessoa = compartilhada) |
| `CreditCard` | cartão | banco (`CardBank`: `NUBANK`, `C6`, `NEON`) e `active` |
| `CardImport` | um upload de fatura | cartão, mês da fatura, nome e hash do arquivo, versão do parser e contagens |
| `CardExpense` | uma linha da fatura num mês | `purchaseKey` identifica a compra; parcela `n/N`; `sourceMonth` (upload que lançou a linha); apelido, categoria e pessoa; exclusão suave (`excludedAt`, `exclusionRemembered`) |

Relações principais: despesas apontam para `Category` e `Person` com `onDelete: Restrict` (não dá para
apagar categoria/pessoa em uso; por isso elas são desativadas, não apagadas). `CardExpense` pertence a
um `CardImport` (`onDelete: Cascade`: apagar o upload apaga as linhas dele).

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
