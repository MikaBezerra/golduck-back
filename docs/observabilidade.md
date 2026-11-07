# Observabilidade

## Logs

Cada requisição gera **uma linha de log** ao final da resposta; também são registrados a subida da API,
consultas lentas ao banco e erros fora de requisição. Código em `src/modules/common/logging/`.

- **Formato:** `pretty` no local (legível, colorido) e `json` nos ambientes publicados (uma linha por
  evento), com `service`, `version`, `commit` e `env` em toda linha (`LOG_FORMAT`).
- **Em cada requisição:** `requestId`, método, rota e caminho, query, status, duração, IP, user agent,
  usuário (id, e-mail e papel), código e motivo do erro (`reason` do `AppError`), detalhes da
  validação, pilha (5xx) e, conforme `LOG_REQUEST_BODY`, o corpo.
- **Níveis:** 5xx = `error`; 4xx (exceto 401) e requisições lentas (`SLOW_REQUEST_MS`) = `warn`; o resto
  = `info`. Rotas marcadas com `@QuietRequestLog()` (ex.: `/health/live`) ficam em `debug`.
- **Privacidade:** senha, tokens, segredos, cookies e `authorization` aparecem como `[oculto]`; textos e
  listas longos são encurtados (até ~4 KB por valor); uploads nunca são registrados; os parâmetros do
  SQL ficam de fora (`sanitize.ts`).
- **Banco:** consultas acima de `SLOW_QUERY_MS` viram `warn` com o SQL; com `LOG_LEVEL=debug` aparecem
  todas as consultas e o log interno do Nest.
- **Processo:** falha na subida, promise rejeitada sem tratamento e exceção não tratada também vão
  para o log (`process-logging.ts`).

```text
[API] 1234 - 07/11 13:24:06  INFO  API no ar  port=3000  prefix=/api  env=local  version=0.1.0  swagger=/docs
[API] 1234 - 07/11 13:24:09  WARN   POST   /api/auth/login  400 +4ms  [ca9d9885]
    ↳ VALIDATION_ERROR
    ↳ detalhes: [{"field":"email","code":"string.email","message":"email deve conter um e-mail válido"}]
    ↳ corpo: {"email":"nao-e-email","password":"[oculto]"}
```

## Correlação

- Toda resposta traz `x-request-id` e `x-app-version`. O id enviado pelo cliente é reaproveitado se for
  válido (`^[A-Za-z0-9._-]{8,128}$`); senão a API gera um UUID.
- O mesmo id vem no corpo dos erros (`error.requestId`). O front mostra os 8 primeiros caracteres como
  "código de suporte": com ele, é só procurar o id nos logs.

## Status e versão

| Rota | Acesso | Para quê |
| --- | --- | --- |
| `GET /api/health/live` | público | "está no ar?" para monitor de disponibilidade; não consulta o banco; log em `debug` |
| `GET /api/version` | público | nome, versão, commit e ambiente publicados |
| `GET /api/health` | ADMIN | estado da API e do banco (`503 SERVICE_UNAVAILABLE` se o banco não responder) |

## Mudou algo aqui?

Campos novos no log precisam passar pelo `sanitize.ts` (nada de dado sensível). Atualize esta página e
os testes de `common/spec/logging/`.
