# Sincronização dos cartões (Meu Pluggy)

As compras dos cartões chegam pelo **Open Finance**, através do **Meu Pluggy**: uma vez por dia o Golduck
busca as transações de cada cartão e monta as faturas sozinho, inclusive a que ainda está aberta. O upload
de CSV/PDF ([importacao-de-faturas.md](importacao-de-faturas.md)) fica como plano B.

## As peças

```text
app do banco ──(Open Finance, autorizado pelo usuário)──▶ Meu Pluggy ──(conector "MeuPluggy")──▶ aplicação no Pluggy Dashboard
                                                                                                   │ PLUGGY_CLIENT_ID / SECRET
                                                                                                   ▼
                                               POST /credit-cards/{id}/sync ou rotina diária ──▶ API da Pluggy ──▶ CardExpense
```

- **Meu Pluggy** (`meu.pluggy.ai`): onde cada banco é conectado. Grátis para uso pessoal (até 5
  conexões), atualiza os dados **a cada 24 horas** e a autorização vale **1 ano** (depois, o item fica em
  `LOGIN_ERROR` e é preciso autorizar de novo no Dashboard).
- **Item**: a conexão de um banco; o id dele vai no cartão (`pluggyItemId`). A conta de cartão de crédito
  dentro do item é descoberta na primeira sincronização (`pluggyAccountId`).
- O módulo é `card-sync`: cliente HTTP da Pluggy (`pluggy/`), tradução por banco
  (`pluggy-transaction.normalizer.ts`), plano (`card-sync.planner.ts`, funções puras) e serviço.

## Configuração do cartão

| Campo | Para quê |
| --- | --- |
| `dueDay` | dia do vencimento. A fatura recebe o nome do **mês em que vence**: a aberta em novembro, paga em dezembro, é a de dezembro |
| `bestPurchaseDay` | melhor dia de compra **padrão**: compras a partir dele vão para a fatura seguinte |
| `pluggyItemId` | item do banco no Meu Pluggy (trocar o item apaga a conta descoberta) |
| `syncFromMonth` | primeira fatura controlada pela sincronização; as anteriores ficam como estão |

Sem os quatro, `POST /credit-cards/{id}/sync` responde `409 CARD_SYNC_NOT_CONFIGURED`.

## Ciclo da fatura (`credit-cards/service/billing-calendar.ts`)

O que decide a fatura é o **dia em que o banco lança a compra** (`billPostDate` da Pluggy), de 1 a 3 dias
depois dela, e não o dia da compra: no C6, a compra de 24/09 lançada em 25/09 foi para a fatura seguinte à que
"fecha 25/09". Com essa regra e o melhor dia 25, a fatura de novembro/2026 do C6 sincronizada bateu centavo a
centavo com o CSV do banco (91 compras, R$ 5.587,01).

O fechamento **varia de mês a mês** (no C6, entre os dias 21 e 26). Por isso cada fatura (`CardBill`) tem o seu
melhor dia, que vale nesta ordem:

1. **o fechamento informado pelo banco** (`bankClosingDate`): o primeiro dia de lançamento que já vai para a
   fatura seguinte. Só existe depois que a fatura fecha (no C6, semanas depois); vem de `GET /bills` da Pluggy
   a cada sincronização;
2. **o ajuste do usuário** para aquela fatura (`PUT /credit-cards/{id}/bills/{month}`), copiado do app do banco;
3. **o padrão do cartão**: o `bestPurchaseDay` no mês anterior ao vencimento (ou no próprio mês, quando
   vem antes do dia do vencimento).

`GET /credit-cards/{id}/bills` mostra início, fechamento, melhor dia, vencimento e de onde veio cada um.
Sem `billPostDate`, vale o dia da transação no horário de Brasília (UTC−3): uma compra às 22h31 de 22/10
chega como `2026-10-23T01:31Z` e conta como 22/10.

A "fatura prevista" da Pluggy (`billForecastDate`) só é usada no Nubank: no C6 e no Neon ela traz o mês do
lançamento, não o da fatura. O id da fatura (`billId`) só chega depois do vencimento.

## Regras da sincronização (`card-sync.planner.ts`)

A sincronização é a fonte da verdade das faturas a partir de `syncFromMonth`:

1. **Chave da compra** (`purchaseKey`): parcelada = `P|data da compra|total|DESCRIÇÃO`; à vista =
   `S|data|valor|DESCRIÇÃO`. Repetições idênticas recebem `#2`, `#3`...
2. **Fatura de cada lançamento**: a correção do usuário (abaixo) vale sobre tudo; depois, a fatura informada
   pelo banco (`billId`); depois, a prevista pelo Nubank; senão, o calendário do cartão aplicado ao dia em que
   o banco lançou a compra.
3. **Parcelas que o banco não mandou** são lançadas a partir da última conhecida, uma por mês (o Neon só
   manda a 1ª parcela; o C6 manda cada uma quando é lançada; o Nubank manda todas, até as futuras).
   Duas parcelas da mesma compra nunca dividem a fatura.
4. **Linha que já existe na mesma fatura** é atualizada só no que vem do banco; apelido, categoria, pessoa
   e exclusão ficam. **Linha nova** herda isso de outra parcela da mesma compra; sem histórico, vai para
   "Outros", sem apelido nem pessoa (não há pré-visualização: o usuário corrige depois).
5. **Linhas sincronizadas ou de upload** que não vieram são removidas: compra que mudou de fatura (porque o
   banco informou o fechamento, por exemplo) sai da antiga e entra na nova, com a personalização.
6. **Compras de "Adicionar compra"** ficam. Quando o banco traz a mesma compra (mesmo valor e total de
   parcelas, até 3 dias de diferença), a do banco a substitui e herda apelido, categoria e pessoa.

Busca: as transações desde 13 meses antes de `syncFromMonth` (compras parceladas antigas ainda têm
parcelas nas faturas atuais) e todas as faturas fechadas. Tudo é gravado numa transação; a segunda
sincronização sem novidades não muda nada (`unchanged`).

### Tradução por banco (`pluggy-transaction.normalizer.ts`)

| Banco | Descrição | Parcelas |
| --- | --- | --- |
| C6 | largura fixa `ESTABELECIMENTO(22) CIDADE(13) PAÍS(3)`: fica o estabelecimento, como no CSV | nos metadados; cada uma chega no mês em que é lançada |
| Nubank | termina em `" 4/8"` nas parcelas: o sufixo sai | todas chegam, inclusive as futuras; a fatura prevista pelo banco acerta |
| Neon | largura fixa `ESTABELECIMENTO(25) CIDADE(13) PAÍS(2)` à vista; parceladas como `LOJA CIDADE BR 1/5` (saem o país e a parcela) | só a 1ª chega; as seguintes usam o valor dela, então pode haver diferença de centavos para a fatura do banco |

Ficam de fora pagamentos da fatura (`PAGAMENTO_FATURA`), estornos e créditos. Compra em outra moeda usa o
valor em reais (`amountInAccountCurrency`). Cartão `0000` (Neon) fica sem final.

## Correções do usuário (`card-expenses`)

- **Mudar de fatura ou de parcela** (`POST /card-expenses/{id}/move`): a linha passa a ser a parcela
  informada no mês informado e as outras seguem a partir dela (3/5 em novembro movida para dezembro como
  1/5 vira 1/5 em dezembro até 5/5 em abril; novembro deixa de ter a compra). Em compras sincronizadas a
  correção é gravada (`CardPurchaseCorrection`) e as próximas sincronizações a respeitam. Compras de
  upload não mudam (`409 CARD_EXPENSE_MOVE_NOT_ALLOWED`).
- **Adicionar compra** (`POST /card-expenses`): uma compra que está faltando (`origin MANUAL`, chave
  `M|<uuid>`); parcelada, lança também as seguintes. Nem a sincronização nem o upload a apagam.

## Quando roda

- **Botão**: `POST /credit-cards/{id}/sync` (um cartão) e `POST /card-sync` (todos; o erro de um cartão
  vai no resultado dele).
- **Rotina diária** da Vercel (`crons` no `vercel.json`, todo dia às 17h UTC, 14h em Brasília, depois da
  atualização diária do Meu Pluggy): `GET /api/card-sync/cron`, sem login, com
  `Authorization: Bearer <CRON_SECRET>` (a Vercel manda sozinha). Sem `CRON_SECRET`, a rota responde
  `401 CRON_UNAUTHORIZED`. No plano Hobby a rotina roda no máximo 1 vez por dia, em algum momento daquela hora.

A cada tentativa o cartão guarda a situação (`sync` na resposta de `/credit-cards`): fim da última
sincronização, última atualização dos dados na Pluggy, situação do item, erro e fim da autorização.

## Erros

| Código | Quando |
| --- | --- |
| `409 CARD_SYNC_NOT_CONFIGURED` | cartão sem item, vencimento, melhor dia ou primeira fatura |
| `422 CARD_SYNC_NO_CREDIT_ACCOUNT` | o item não tem cartão de crédito |
| `422 CARD_SYNC_ITEM_NOT_FOUND` | a Pluggy não conhece o item |
| `502 PLUGGY_AUTH_FAILED` | Client ID/Secret recusados |
| `502 PLUGGY_UNAVAILABLE` | a Pluggy não respondeu ou respondeu erro (nada é gravado) |
| `503 PLUGGY_DISABLED` | sem `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` no ambiente |

## Testes

Os testes usam uma Pluggy falsa (`card-sync/spec/in-memory-card-sync.ts`) e transações no formato real com
dados inventados (`pluggy-fixtures.ts`), nunca uma fatura real. O cliente HTTP é testado com um `fetch`
falso (autenticação, paginação, erros).
