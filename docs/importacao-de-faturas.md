# Importação de faturas

O usuário envia o arquivo que o banco do cartão exporta (ou digita a fatura) para um **mês de fatura**.
O back lê as compras, concilia com o que já existe e grava as despesas do cartão (`CardExpense`).

## Fluxo

```text
1. POST /card-imports/preview   (multipart: file, cardId, month, password?)
     → mostra o que o upload faria, sem gravar: compras novas/atualizadas (com sugestão de apelido,
       categoria e pessoa), despesas do mês que seriam apagadas, compras excluídas que reapareceram
2. o usuário escolhe apelido/categoria/pessoa (overrides) e o que fazer com as excluídas (exclusions)
3. POST /card-imports           (o mesmo arquivo + overrides + exclusions)
     → lê o arquivo de novo (ele é a fonte da verdade) e grava tudo numa transação
```

- `POST /card-imports/manual`: fatura digitada, para bancos sem arquivo compatível. Segue as mesmas
  regras do upload.
- `GET /card-imports`: histórico de uploads (mais recentes primeiro). `DELETE /card-imports/{id}` apaga o
  upload e as despesas que ele gravou (não restaura o estado anterior).
- Arquivo de até 2 MB (`IMPORT_FILE_TOO_LARGE`), um por requisição; o tipo precisa ser o do banco do
  cartão (`IMPORT_INVALID_FILE_TYPE`). PDF com senha errada: `422 IMPORT_FILE_PASSWORD_INVALID`; arquivo
  que não é do banco ou formato que mudou: `422 IMPORT_UNSUPPORTED_FORMAT`.

## Regras da conciliação

Implementadas como funções puras em `card-imports/service/card-import.planner.ts` (o mesmo plano serve
para a pré-visualização e para o salvamento). Para um upload do mês **M**:

1. **O upload é absoluto para M:** compras de M que não vieram no arquivo são removidas, junto com as
   parcelas futuras que elas projetaram.
2. Compras do arquivo são **atualizadas** em M (mantendo apelido, categoria e pessoa) ou **criadas**.
3. Uma parcela `n/N` **projeta** as parcelas seguintes nos meses M+1 até M+(N−n), mas para antes do
   primeiro mês posterior que tenha upload próprio: dali em diante, quem decide é o upload daquele mês.
   Uma projeção nunca sobrescreve linhas gravadas por uploads de meses posteriores.
4. Linhas novas **herdam** apelido, categoria e pessoa de outra parcela da mesma compra.
5. Uma escolha do usuário (override) vale para todas as linhas que o upload grava daquela compra.
6. A **exclusão suave** é mantida nas atualizações e herdada pelas linhas novas. Compra excluída que
   reaparece pergunta de novo, a menos que o usuário tenha marcado "não perguntar de novo"
   (`exclusionRemembered`).

### Identidade da compra (`purchaseKey`)

Reconhece a mesma compra em uploads diferentes:

- parcelada: descrição + total de parcelas + mês de origem (M − (n − 1));
- à vista: descrição + data + valor;
- repetições idênticas no mesmo arquivo recebem os sufixos `#2`, `#3`...

As escolhas da pré-visualização são enviadas por `purchaseKey`; uma chave que não está no arquivo
(a fatura mudou desde a pré-visualização) dá `400 IMPORT_OVERRIDE_UNKNOWN_KEY`.

## Bancos (parsers)

| Banco | Arquivo | Parser |
| --- | --- | --- |
| Nubank | CSV | `parsers/nubank-csv.parser.ts` |
| C6 | CSV | `parsers/c6-csv.parser.ts` |
| Neon | PDF (pode ter senha) | `parsers/neon-pdf.parser.ts` (`pdfjs-dist`) |

O `card-statement-parser.registry.ts` escolhe o parser pelo banco do cartão. Cada parser devolve as
transações já normalizadas (data, descrição, valor em centavos, parcela, titular e final do cartão) e
quantas linhas foram ignoradas (pagamentos, estornos etc.); cada um tem uma `parserVersion`, gravada no
upload para rastrear de qual versão vieram as linhas.

### Adicionando um banco

1. Valor novo no enum `CardBank` (`schema.prisma`) + migração.
2. Parser em `parsers/` implementando a interface de `card-statement.parser.ts`, registrado no
   `card-statement-parser.registry.ts`.
3. Testes com um arquivo de exemplo **anonimizado** em `card-imports/spec/` (nunca uma fatura real).
4. Esta página e a tabela de bancos em [regras-de-negocio.md](regras-de-negocio.md).
5. Avise o front (lista de bancos e tipo de arquivo aceito).
