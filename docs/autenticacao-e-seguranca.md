# Autenticação e segurança

## Sessão

```text
POST /auth/login   { email, password }  →  { data: { accessToken } }  +  cookie golduck_refresh (httpOnly)
qualquer rota      Authorization: Bearer <accessToken>
POST /auth/refresh (sem corpo, o navegador manda o cookie)  →  novo accessToken + novo cookie
POST /auth/logout  (cookie e/ou Bearer, mesmo vencido)  →  204 + cookie apagado
GET  /auth/me      →  { id, email, role }
```

- **Access token:** JWT HS256 de **15 minutos** (`sub` = usuário, `sid` = sessão, emissor
  `JWT_ISSUER`). Vai no header `Authorization`.
- **Refresh token:** valor aleatório de uso único, guardado no banco só como hash (`AuthSession`).
  Fica num cookie `HttpOnly`, `Secure`, `Path=/api/auth`, `SameSite` de `AUTH_COOKIE_SAMESITE`: o
  JavaScript do front não consegue lê-lo (proteção contra XSS) e o navegador só o envia às rotas de
  autenticação.
- **Rotação:** cada refresh troca o token e grava o cookie novo. Reusar um token antigo (sinal de
  roubo) encerra a sessão.
- **Validade:** a sessão vale 7 dias, renovados a cada refresh, mas **nunca mais de 30 dias desde o
  login**; depois disso, senha de novo. O `Max-Age` do cookie acompanha o tempo que resta.
- **Sessão inválida** (vencida, revogada, usuário inativo): `401 AUTH_INVALID_SESSION` e o cookie é
  apagado.
- **Cada requisição** confere o token **e** a sessão no banco (`JwtAuthGuard`): logout ou desativação do
  usuário valem na hora, sem esperar o token vencer.

## Login

- Senhas com **Argon2id** (`password.service.ts`).
- Mensagem única para e-mail inexistente, senha errada ou usuário inativo (`AUTH_INVALID_CREDENTIALS`).
- E-mail inexistente também passa pela comparação de senha (com um hash descartável), para o tempo de
  resposta não revelar quais contas existem.
- **Limite por IP:** 5 tentativas por minuto no login e 20 no refresh (`@RateLimit()`), com
  `429 TOO_MANY_REQUESTS` e `Retry-After`.
- **Trava por e-mail:** 10 erros no mesmo e-mail em 15 minutos, de qualquer IP, travam o login dele com
  429 até a janela passar; um acerto zera a contagem (`login-attempts.service.ts`). Efeito colateral
  aceito: alguém pode travar o login de outra pessoa por até 15 minutos.
- Os contadores ficam em memória (por instância da API).

## Papéis

`USER` e `ADMIN`. `@Roles(Role.USER)` no controller libera usuários comuns; ADMIN passa em tudo
(`RolesGuard`). Rotas abertas usam `@Public()`. Hoje só `GET /health` é exclusiva de ADMIN.
Usuários são criados por `npm run admin:create` (local), `admin:create:develop` ou `admin:create:production`.

## Proteções da API

- **CSRF:** login, refresh e logout (as rotas que mexem no cookie) usam `@TrustedOrigin()`: se a
  requisição trouxer o header `Origin`, ele precisa estar em `API_CORS_ORIGINS` ou ser a própria API;
  senão, `403 FORBIDDEN`. Sem `Origin` (curl, servidores) passa.
- **CORS:** só ligado com `API_CORS_ORIGINS`; origens explícitas (nunca `*`), com credenciais, métodos
  `GET, HEAD, POST, PATCH, DELETE`, headers `Authorization`, `Content-Type`, `x-request-id`, e expõe
  `x-request-id`, `x-app-version` e `retry-after` ao front.
- **Helmet:** headers de segurança em toda resposta; a CSP só é desligada quando o Swagger está ligado.
- **Proxy:** `TRUST_PROXY` define em quem confiar para descobrir o IP real (limites por IP dependem
  disso).
- **Logs:** senha, tokens, cookies e `authorization` nunca aparecem ([observabilidade.md](observabilidade.md)).
- **Configuração:** `JWT_SECRET` com menos de 32 caracteres impede a API de subir.

## Deploy e cookie

Com front e API em domínios `*.vercel.app` diferentes, o navegador trata o cookie como de outro site e
o Safari o bloqueia. Por isso o front serve a API em `/api` no próprio domínio (rewrite na Vercel para o
projeto da API): para o navegador é tudo o mesmo site e o `AUTH_COOKIE_SAMESITE=strict` funciona. O
`Origin` que chega à API é o do front, então ele precisa estar em `API_CORS_ORIGINS`. Com domínio
próprio, a API também pode ficar num subdomínio (ex.: `api.golduck.com.br`, com o front em
`golduck.com.br`).

## Onde está no código

`src/modules/auth/` (controller, service, `security/`: guards, tokens, cookie, senhas, trava por e-mail)
e `src/modules/common/security/` (`@RateLimit`, `@TrustedOrigin`). Testes em `auth/spec/` e
`common/spec/security/`.
