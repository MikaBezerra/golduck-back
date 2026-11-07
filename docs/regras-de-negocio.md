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
| **Categorias** | nome único sem diferenciar maiúsculas (espaços repetidos são removidos). "Outros" é a padrão: recebe despesas sem categoria e não pode ser renomeada nem desativada. Também são desativadas, não apagadas. |
| **Cartões** | um cartão = uma fatura de um banco (`NUBANK`, `C6`, `NEON`). O banco não muda depois do cadastro. Cartão inativo não recebe upload (`409 CREDIT_CARD_INACTIVE`). |

## Entrada e reserva do mês

- **Entrada** (`incomes`): o dinheiro que entra no mês para dividir. **Reserva** (`reserves`): quanto
  foi guardado no mês.
- Um registro por mês. O cadastro aceita o mesmo valor para vários meses de um ano de uma vez
  (`{ year, months: [1, 2, 3], amount }`); se qualquer um dos meses já existir, nada é gravado
  (`409 *_MONTH_CONFLICT`).
- Consulta, alteração e remoção são pelo mês (`/incomes/2026-11`).
- `GET /reserves/totals`: soma histórica de todas as reservas e a soma de cada ano.

## Despesas fora do cartão (`manual-expenses`)

- Cada despesa tem mês, título, valor, categoria e, opcionalmente, uma pessoa.
  **Sem pessoa = compartilhada** (dividida entre todos); com pessoa = individual.
- Sem categoria, vai para "Outros". Categoria ou pessoa inativa: `409 MANUAL_EXPENSE_INACTIVE_*`.
- `replicateUntilYearEnd`: cria uma cópia por mês, do mês informado até dezembro.
- Alteração e exclusão são em lote (lista de IDs) e numa transação: ou todas, ou nenhuma.

## Despesas do cartão (`card-expenses`)

As linhas vêm das faturas importadas ([importacao-de-faturas.md](importacao-de-faturas.md)). O usuário
pode:

- dar um **apelido** e escolher **categoria** e **pessoa**; numa compra parcelada, a mudança vale também
  para as parcelas seguintes;
- **excluir** (exclusão suave: a linha sai das listas e dos totais) e **restaurar**, com escopo:
  `month` (só o mês), `forward` (o mês e os seguintes), `backward` (o mês e os anteriores) ou `all`
  (todas as parcelas da compra) — `card-expense-scope.ts`.

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

## Mudou uma regra?

Atualize esta página no mesmo PR, com um exemplo numérico se for conta, e os testes da regra (de
preferência na função pura que faz a conta).
