# API (contrato HTTP)

Todas as rotas ficam sob o prefixo `/api` (`API_PREFIX`). A documentação interativa (Swagger) fica em
`/docs` e o JSON em `/docs-json` quando `SWAGGER_ENABLE=1`; o front gera os tipos TypeScript a partir
desse JSON, então **todo DTO precisa de `@ApiProperty`** e toda rota de `@ApiOperation` +
`@ApiDataResponse`.

## Envelope

Sucesso:

```json
{ "data": { "id": "…", "name": "Mercado" } }
```

Erro:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Os dados enviados são inválidos", "requestId": "3f2a9c1e-…",
  "details": [{ "field": "name", "code": "any.required", "message": "name é obrigatório" }] } }
```

- `code` é estável: o front decide a mensagem por ele. `message` é em português e pode ser mostrada.
- `requestId` é o mesmo do header `x-request-id` ([observabilidade.md](observabilidade.md)).
- `details` só aparece em erros de validação.
- `204 No Content` não tem corpo (ex.: `DELETE`, `/auth/logout`).

Quem monta: `common/http/api-response.interceptor.ts` (`{ data }`) e
`common/http/api-exception.filter.ts` (`{ error }`).

## Formatos

| Dado | Formato | Exemplo |
| --- | --- | --- |
| Dinheiro | texto com até 2 casas, sem separador de milhar | `"1234.56"` |
| Mês | `AAAA-MM` | `"2026-11"` |
| Data | `AAAA-MM-DD` | `"2026-11-07"` |
| Data e hora | ISO 8601 em UTC | `"2026-11-07T13:24:06.000Z"` |
| IDs | UUID v4 | `"3f2a9c1e-8b7d-4c2a-9e1f-5a6b7c8d9e0f"` |

## Rotas

Login exigido em todas, salvo as marcadas como públicas. ADMIN acessa tudo.

| Módulo | Rotas |
| --- | --- |
| status (públicas) | `GET /health/live`, `GET /version`; `GET /health` (só ADMIN; consulta o banco) |
| `auth` | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (públicas, com checagem de origem); `GET /auth/me` |
| `people` | `POST /people`, `GET /people[?includeInactive]`, `GET /people/{id}`, `PATCH /people/{id}` |
| `categories` | `POST /categories`, `GET /categories[?includeInactive]`, `GET /categories/{id}`, `PATCH /categories/{id}` |
| `incomes` | `POST /incomes` (mesmo valor em vários meses), `GET /incomes[?year]`, `GET/PATCH/DELETE /incomes/{month}` |
| `reserves` | `POST /reserves`, `GET /reserves[?year]`, `GET /reserves/totals`, `GET/PATCH/DELETE /reserves/{month}` |
| `manual-expenses` | `POST /manual-expenses`, `GET /manual-expenses?month`, `GET /manual-expenses/{id}`, `PATCH` e `DELETE /manual-expenses` (vários IDs, em transação) |
| `credit-cards` | `POST /credit-cards`, `GET /credit-cards`, `GET /credit-cards/{id}`, `PATCH /credit-cards/{id}` |
| `card-imports` | `POST /card-imports` (upload), `POST /card-imports/preview`, `POST /card-imports/manual`, `GET /card-imports`, `GET/DELETE /card-imports/{id}` |
| `card-expenses` | `GET /card-expenses?month&cardId[&includeExcluded]`, `GET /card-expenses/{id}`, `PATCH /card-expenses`, `DELETE /card-expenses`, `POST /card-expenses/restore` |
| `summary` | `GET /summary?month`, `GET /summary/annual?year`, `GET /summary/statement?month` (tabela por pessoa) |
| `summary-dispatch` (só ADMIN) | `POST /summary/dispatches` (envia o resumo por e-mail; header `Idempotency-Key`), `GET /summary/dispatches?month`, `GET /summary/dispatches/preview?month`, `GET /summary/dispatches/email?month&personId` |

Os campos de cada rota estão no Swagger; as regras, em [regras-de-negocio.md](regras-de-negocio.md) e
[importacao-de-faturas.md](importacao-de-faturas.md); o envio por e-mail, em [envio-de-resumos.md](envio-de-resumos.md).

## Validação

Cada body/query/param passa por um pipe Joi (`flow/` do módulo, base em
`common/validation/joi-validation-ptbr.pipe.ts`):

- campos desconhecidos são recusados (`unknown(false)`), no body e na query;
- textos têm `trim` e limites de tamanho iguais aos do banco;
- falha → `400 VALIDATION_ERROR`, com um item em `details` por problema e mensagens em português.

## Códigos de erro

Genéricos (`common/errors/error-catalog.ts` e o filtro de exceções):

| Código | Status | Quando |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | requisição malformada (ex.: JSON inválido) |
| `VALIDATION_ERROR` | 400 | dados fora do formato (com `details`) |
| `UNAUTHENTICATED` | 401 | autenticação necessária (genérico) |
| `FORBIDDEN` | 403 | acesso negado (ex.: origem não confiável no login/refresh/logout) |
| `NOT_FOUND` | 404 | rota ou recurso inexistente |
| `CONFLICT` | 409 | conflito genérico |
| `PAYLOAD_TOO_LARGE` | 413 | corpo maior que o permitido |
| `TOO_MANY_REQUESTS` | 429 | limite de tentativas; header `Retry-After` com os segundos de espera |
| `SERVICE_UNAVAILABLE` | 503 | dependência fora do ar (ex.: banco no `/health`) |
| `INTERNAL_ERROR` | 500 | erro inesperado (detalhes só no log) |

Dos módulos (`errors/` de cada um):

| Módulo | Códigos |
| --- | --- |
| `auth` | `AUTH_INVALID_CREDENTIALS` 401, `AUTH_INVALID_SESSION` 401, `AUTH_UNAUTHENTICATED` 401, `AUTH_FORBIDDEN` 403 |
| `people` | `PERSON_NOT_FOUND` 404 |
| `categories` | `CATEGORY_NOT_FOUND` 404, `CATEGORY_NAME_CONFLICT` 409, `CATEGORY_DEFAULT_PROTECTED` 409 |
| `incomes` | `INCOME_NOT_FOUND` 404, `INCOME_MONTH_CONFLICT` 409, `INCOME_INVALID_AMOUNT` 400 |
| `reserves` | `RESERVE_NOT_FOUND` 404, `RESERVE_MONTH_CONFLICT` 409, `RESERVE_INVALID_AMOUNT` 400 |
| `manual-expenses` | `MANUAL_EXPENSE_NOT_FOUND` 404, `MANUAL_EXPENSE_INVALID_AMOUNT` 400, `MANUAL_EXPENSE_INACTIVE_CATEGORY` 409, `MANUAL_EXPENSE_INACTIVE_PERSON` 409 |
| `credit-cards` | `CREDIT_CARD_NOT_FOUND` 404, `CREDIT_CARD_INACTIVE` 409 |
| `card-imports` | `CARD_IMPORT_NOT_FOUND` 404, `IMPORT_FILE_REQUIRED` 400, `IMPORT_INVALID_FILE_TYPE` 400, `IMPORT_INVALID_AMOUNT` 400, `IMPORT_OVERRIDE_UNKNOWN_KEY` 400, `IMPORT_FILE_TOO_LARGE` 413, `IMPORT_FILE_PASSWORD_INVALID` 422, `IMPORT_UNSUPPORTED_FORMAT` 422 |
| `card-expenses` | `CARD_EXPENSE_NOT_FOUND` 404, `CARD_EXPENSE_INACTIVE_CATEGORY` 409, `CARD_EXPENSE_INACTIVE_PERSON` 409 |
| `summary-dispatch` | `SUMMARY_DISPATCH_UNKNOWN_PERSON` 400, `SUMMARY_DISPATCH_IN_PROGRESS` 409, `SUMMARY_DISPATCH_KEY_REUSED` 409, `MAIL_DISABLED` 503, `MAIL_UNAVAILABLE` 503 (falha de uma pessoa não é erro: vira item `FAILED` na resposta 200) |

Criou um código? Acrescente aqui e avise o front (ele pode querer uma mensagem própria).

## Paginação

Listas paginadas recebem `?page=1&pageSize=20` (máximo 100) e respondem
`{ "data": { "items", "page", "pageSize", "total", "totalPages" } }`. Peças em `common/pagination`
(`PageQueryPipe`, `pageQueryKeys` para combinar com outros filtros, `paginate`, `buildPage`) e
`@ApiPaginatedResponse(Dto)` para o Swagger. As listas atuais do Golduck não são paginadas (são
pequenas e por mês).

## Headers

| Header | Direção | Para quê |
| --- | --- | --- |
| `Authorization: Bearer <token>` | entrada | access token ([autenticacao-e-seguranca.md](autenticacao-e-seguranca.md)) |
| `x-request-id` | entrada e saída | id da requisição; o enviado pelo cliente é reaproveitado se for válido |
| `x-app-version` | saída | versão da API |
| `Retry-After` | saída (429) | segundos até poder tentar de novo |
| `Idempotency-Key` | entrada | UUID obrigatório no `POST /summary/dispatches`: a mesma chave devolve o envio já feito, sem reenviar |
| `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` | saída | rotas com `@RateLimit()` |

## Mudou o contrato?

1. DTO e `@ApiProperty` atualizados; rota com `@ApiOperation`/`@ApiDataResponse`.
2. Testes HTTP da rota ([testes.md](testes.md)).
3. Esta página, se mudou rota, código de erro ou header.
4. Avise o front: ele regenera os tipos (`npm run api:types` com `SWAGGER_ENABLE=1`).
