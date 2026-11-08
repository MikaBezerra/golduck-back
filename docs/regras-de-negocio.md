# Regras de negócio

O Golduck organiza as contas de uma casa em que várias pessoas dividem as despesas. A unidade de tempo
é o **mês**: cada mês tem uma entrada, uma reserva, despesas fora do cartão e as faturas de cartão.

## Dinheiro e datas

- Dinheiro é sempre **centavos inteiros**: `BIGINT` no banco, `bigint` no código e texto `"1234.56"` na
  API (`common/money/money.ts`). Nenhuma conta usa ponto flutuante.
- Valores inválidos (mais de 2 casas, negativos onde não cabem, fora do limite do `BIGINT`) viram
  `400 <MÓDULO>_INVALID_AMOUNT`.
- Mês trafega como `"AAAA-MM"` e é gravado como o dia 1 em UTC (`common/date/month.ts`).

## Cadastros

| Cadastro | Regras |
| --- | --- |
| **Pessoas** | não são apagadas, só desativadas (o histórico de despesas continua apontando para elas). Inativas não entram em despesas novas nem na divisão do resumo. |
| **Categorias** | nome único sem diferenciar maiúsculas (espaços repetidos são removidos). "Outros" é a padrão: recebe despesas sem categoria e não pode ser renomeada, desativada nem excluída (`409 CATEGORY_DEFAULT_PROTECTED`). Desativar tira a categoria das escolhas e mantém o histórico; **excluir** (`DELETE /categories/{id}`) passa todas as despesas dela (fora do cartão e do cartão, inclusive as excluídas) para "Outros" e apaga a categoria, numa transação. A resposta diz quantas despesas mudaram (`movedManualExpenses`, `movedCardExpenses`). |
| **Cartões** | um cartão = uma fatura de um banco (`NUBANK`, `C6`, `NEON`). O banco não muda depois do cadastro. Cartão inativo não recebe upload (`409 CREDIT_CARD_INACTIVE`). O **limite** (`creditLimit`) é sempre informado pelo usuário (opcional; zero é `400 CREDIT_CARD_INVALID_AMOUNT`; `null` no PATCH apaga). |

## Entrada e reserva do mês

- **Entrada** (`incomes`): o dinheiro que entra no mês para dividir. **Reserva** (`reserves`): quanto
  foi guardado no mês.
- Um registro por mês. O cadastro aceita o mesmo valor para vários meses de um ano de uma vez
  (`{ year, months: [1, 2, 3], amount }`); se qualquer um dos meses já existir, nada é gravado
  (`409 *_MONTH_CONFLICT`).
- Consulta, alteração e remoção são pelo mês (`/incomes/2026-11`).
- `GET /reserves/totals`: soma histórica de todas as reservas e a soma de cada ano.

## De quem é a despesa (`split`)

Toda despesa diz de quem é no campo `split` (`common/expense-split/expense-split.ts`):

| `split` | `personId` | Significado |
| --- | --- | --- |
| `PENDING` | `null` | compra do cartão que chegou pela sincronização ou pelo upload e **ninguém classificou ainda** |
| `SHARED` | `null` | compartilhada: dividida entre as pessoas ativas |
| `PERSONAL` | obrigatório | individual da pessoa |

- Por que existe: com a sincronização trazendo compras sozinha, "sem pessoa" deixava de distinguir
  "compartilhada" de "ninguém olhou", e uma compra individual esquecida virava compartilhada sem aviso.
- O banco garante a regra com um `CHECK` (pessoa só, e sempre, no `PERSONAL`); despesa manual nunca é `PENDING`.
- Quem cria ou edita escolhe `SHARED` ou `PERSONAL` (+ `personId`); `PENDING` não é uma escolha. Com
  `SHARED`, `personId` pode faltar ou vir `null`; com `PERSONAL`, é obrigatório.
- Só nasce `PENDING` a compra **nova de verdade**: parcelas seguintes de uma compra já classificada e a
  compra do banco que substitui uma de "Adicionar compra" herdam o `split` e a pessoa.
- No resumo, `PENDING` **conta como compartilhada** (as contas não travam), mas os resumos devolvem
  `pending` (quantidade e soma) e o **envio por e-mail é recusado** enquanto o mês tiver alguma
  (`409 SUMMARY_DISPATCH_PENDING_EXPENSES`).

## Despesas fora do cartão (`manual-expenses`)

- Cada despesa tem mês, título, valor, categoria e `split` (`SHARED` ou `PERSONAL` + `personId`),
  escolhido na criação (obrigatório).
- Sem categoria, vai para "Outros". Categoria ou pessoa inativa: `409 MANUAL_EXPENSE_INACTIVE_*`.
- `replicateUntilYearEnd`: cria uma cópia por mês, do mês informado até dezembro.
- Alteração e exclusão são em lote (lista de IDs) e numa transação: ou todas, ou nenhuma.
- **Paga**: `changes.paid: true` marca as despesas como pagas (`paidAt` = agora) e `false` desmarca.
  Qualquer mês pode ser marcado; não muda nenhuma conta do resumo.
- **Resumo da aba Despesas** (`GET /manual-expenses/summary?month=`, `manual-expenses/service/manual-expense-summary.ts`,
  função pura): total por categoria (do maior para o menor; empate pelo nome), com a quantidade de
  despesas, e no topo o total do mês, quanto já foi pago (`paid`) e quanto falta (`unpaid`). Categorias
  inativas aparecem se tiverem despesas no mês. Só despesas fora do cartão: as faturas têm o resumo delas.

## Despesas do cartão (`card-expenses`)

As linhas vêm da sincronização com o Meu Pluggy ([sincronizacao-de-cartoes.md](sincronizacao-de-cartoes.md)),
de uploads de fatura ([importacao-de-faturas.md](importacao-de-faturas.md)) ou de "Adicionar compra"
(`origin`: `SYNC`, `UPLOAD` ou `MANUAL`). A fatura recebe o nome do **mês em que vence**; o ciclo de cada
fatura (melhor dia de compra, fechamento) está em [sincronizacao-de-cartoes.md](sincronizacao-de-cartoes.md#ciclo-da-fatura-credit-cardsservicebilling-calendarts).
O usuário pode:

- **adicionar uma compra** que está faltando numa fatura (à vista ou parcelada, lançando as parcelas
  seguintes), escolhendo na hora de quem ela é (`split` obrigatório);
- **mudar a compra de fatura ou de parcela**: a compra inteira muda a partir da linha escolhida, e a
  sincronização passa a respeitar a correção (compras de upload não mudam);

- dar um **apelido** e escolher **categoria** e **pessoa** (`split`); numa compra parcelada, a mudança vale
  também para as parcelas seguintes (classificar uma compra pendente tira as parcelas seguintes de `PENDING`);
- listar só as que faltam classificar: `GET /card-expenses?month=&split=PENDING`;
- **excluir** (exclusão suave: a linha sai das listas e dos totais) e **restaurar**, com escopo:
  `month` (só o mês), `forward` (o mês e os seguintes), `backward` (o mês e os anteriores) ou `all`
  (todas as parcelas da compra) — `card-expense-scope.ts`.

## Fatura paga (`credit-cards`)

`PUT /credit-cards/{id}/bills/{month}/payment` marca a fatura como paga; `DELETE` na mesma rota desmarca.
A situação de cada fatura (`status`, `credit-cards/service/bill-status.ts`, função pura):

| `status` | Quando |
| --- | --- |
| `open` | antes do fechamento (ainda recebe compras) |
| `closed` | fechou e falta pagar |
| `overdue` | fechou, passou do vencimento e não foi marcada como paga |
| `paid` | marcada como paga (vale sobre as outras) |

- Só dá para marcar **depois do fechamento** (`409 CREDIT_CARD_BILL_NOT_CLOSED`). Desmarcar não tem restrição.
- Cartão **sem o ciclo configurado** (só upload): o fechamento é desconhecido, então a fatura conta como
  fechada a partir do **mês do vencimento** e nunca aparece como vencida (o vencimento, quando se sabe,
  vem do banco ou do dia do vencimento do cartão).
- Ao marcar, o app guarda o **total do momento** (`paidAmount`, sem as compras excluídas). Se o total
  mudar depois (compra que chega atrasada na sincronização, exclusão), a fatura **continua paga** e
  `changedAfterPayment: true` avisa; marcar como paga de novo confirma o valor novo.
- Exemplo: fatura de dezembro do C6 (melhor dia 25, vence dia 1) fecha em 24/11. Em 20/11 é `open` (e
  não pode ser paga); em 30/11, `closed`; em 02/12 sem pagamento, `overdue`. Paga em 30/11 com 1.234,56;
  uma compra de 50,00 chega em 01/12: `paid`, `paidAmount` 1234.56, `total` 1284.56, `changedAfterPayment` true.

### Resumo das faturas do mês (`GET /credit-cards/bills/summary?month=`)

Topo da aba Faturas: uma linha por cartão e o total geral.

- Cartões: os ativos e, mesmo inativos, os que têm compras no mês; em ordem de nome.
- Cada cartão traz o total da fatura (sem as compras excluídas), a situação (`status`, `paidAt`,
  `paidAmount`, `changedAfterPayment`, como acima), `closingDate`/`dueDate`, o limite e o **limite disponível**.
- `total` = soma das faturas de todos os cartões listados.
- **Limite disponível** = limite − faturas **não pagas** do **mês atual em diante** (parcelas futuras
  incluídas, porque já ocupam o limite). Faturas que venceram em meses anteriores não contam: o app não
  sabe se foram pagas antes de existir a marcação. Pode ficar negativo (limite estourado); `null` sem
  limite cadastrado. É o limite de hoje: não muda com o mês pedido.
- Exemplo (hoje 30/11, limite 5.000,00): novembro 800,00 (paga), dezembro 1.000,00, janeiro 300,00,
  fevereiro 200,00 (parcela), outubro 400,00 (já venceu). Disponível = 5.000 − (1.000 + 300 + 200) = 3.500,00.

## Resumo (`summary`)

Fórmulas em `summary/service/summary.calculator.ts` (funções puras, em centavos):

```text
E  = entrada do mês            R  = reserva do mês
C  = despesas compartilhadas   Dₚ = despesas individuais da pessoa p
k  = número de pessoas ativas

saldo                 = E − (todas as despesas) − R
líquido da pessoa p   = (E − C − R) / k − Dₚ
```

- Despesas = fora do cartão + do cartão **pelo mês da fatura**, sem as excluídas.
- C inclui as compras do cartão ainda `PENDING`; `pending` (`{ amount, count }`, sem as excluídas) avisa
  quantas são. No anual, `pending` soma o ano e cada mês traz `pendingCount`.
- A reserva entra na divisão como mais um gasto compartilhado, mas aparece separada das despesas.
- Quando `E − C − R` não divide exatamente por `k`, os centavos que sobram vão, um a um, para as
  primeiras pessoas em ordem alfabética: a soma das partes é sempre igual a `E − C − R`.
- Pessoas inativas não entram na divisão, mas suas despesas individuais continuam nos totais.
- Totais por categoria e por pessoa em ordem decrescente de valor (empate pelo nome; sem nome por
  último).
- Mês sem entrada (ou sem reserva) cadastrada responde `null` nesse campo, não zero.
- **Resumo anual** (`/summary/annual?year=`): os mesmos totais somados nos 12 meses, mais a lista dos
  meses (para gráficos). O líquido anual de cada pessoa é a **soma dos líquidos mensais**, para o ano
  sempre bater com os meses, inclusive nos centavos distribuídos.

### Tabela do mês (`/summary/statement?month=`)

O mesmo resumo do mês em tabela, com uma coluna por pessoa e as linhas já prontas para desenhar
(`summary/service/summary-statement.builder.ts`, função pura). O front não faz conta: só mostra.

- Colunas: pessoas ativas em ordem alfabética e, depois, as inativas **só** se tiverem gasto individual
  no mês (aparecem, mas não entram na divisão).
- Seções: Entrada, Compartilhado (fixos, cartões e reserva), Individual e Resultado. Cada linha tem
  `total`, um valor por coluna (`cells`) e detalhes (`children`: cada despesa, cada cartão).
- A divisão do compartilhado é feita **uma vez só** (`E − C − R` dividido), como no `/summary`; depois as
  linhas (fixos, cartões, reserva) são ajustadas centavo a centavo para somar exatamente a parte de cada um.
- `breakdown`: o líquido de cada pessoa ativa em etapas, **sem descontar a reserva duas vezes**:

```text
beforeReserve = (E − C) / k              líquido antes da reserva e dos gastos individuais
individual    = Dₚ                       gastos individuais da pessoa
reserve       = parte da pessoa em R      (a linha "Reserva" da tabela)
net           = beforeReserve − individual − reserve   (igual ao net do /summary)
```

  Exemplo: E = 10.000,00, C = 4.000,00, R = 1.000,00, duas pessoas e 800,00 de gastos individuais de uma
  delas: `beforeReserve` 3.000,00, `individual` 800,00, `reserve` 500,00, `net` 1.700,00. A parte da
  reserva é a diferença entre as duas divisões; por isso a conta sempre fecha no centavo.
- `reserve.month`: quanto foi guardado no mês (todas as pessoas; `null` sem reserva).
  `reserve.accumulated`: soma de **todas as reservas até o mês, inclusive** (um mês antigo mostra o
  acumulado daquela época).

## Mudou uma regra?

Atualize esta página no mesmo PR, com um exemplo numérico se for conta, e os testes da regra (de
preferência na função pura que faz a conta).
