# Envio do resumo por e-mail

O botão "Enviar por e-mail" do resumo mensal manda, para cada pessoa ativa do mês, um e-mail com o
**resumo dela**. Código em `src/modules/summary-dispatch/`.

## Por que e-mail (e não WhatsApp)

Avaliado em 2026-11-08, para 2 pessoas e cerca de um envio por semana:

- **API oficial do WhatsApp (Meta):** exige conta Business, número dedicado e template aprovado, e
  mensagem iniciada pela empresa pode ser cobrada.
- **APIs não oficiais (WAHA, Baileys):** precisam de um servidor sempre ligado fora da Vercel (a conexão
  é um WebSocket permanente), violam os termos do WhatsApp e arriscam o banimento do número.
- **E-mail pelo SMTP do Gmail:** grátis, oficial, roda na própria função da Vercel e usa o campo `email`
  que a Pessoa já tem.

O envio fica atrás de uma interface (`SummaryMailer`) e cada envio grava o `channel` (`EMAIL`): outro
canal no futuro é uma nova implementação, não uma reescrita.

## O que a pessoa recebe

Assunto `Golduck · Resumo de novembro/2026`, com `(até 08/11)` quando o mês ainda está em andamento (dia
de Brasília). Corpo em HTML (estilos inline) e uma versão em texto puro, com os valores do
`breakdown` e do `reserve` de `GET /summary/statement` ([regras-de-negocio.md](regras-de-negocio.md)):

| Linha | Campo |
| --- | --- |
| Líquido sem gastos individuais | `beforeReserve` |
| (−) Gastos individuais | `individual` |
| (−) Sua parte da reserva | `reserve` |
| **Líquido** | `net` (verde ou vermelho) |
| Guardado neste mês | `reserve.month` (todas as pessoas; "Nada guardado neste mês" se `null`) |
| Reserva acumulada até o mês | `reserve.accumulated` |

A reserva entra **uma vez só** no líquido. O e-mail não mostra os gastos individuais das outras pessoas.
`renderSummaryEmail` (`service/summary-email.renderer.ts`) é uma função pura: só formata, não calcula.

## Rotas (só ADMIN)

| Rota | Para quê |
| --- | --- |
| `GET /summary/dispatches/preview?month=` | quem vai receber (e-mail mascarado `an•••@gmail.com`, `hasEmail`), se o envio está ligado (`enabled`) e o último envio do mês (`lastDispatch`) |
| `POST /summary/dispatches` + header `Idempotency-Key` | envia; `{ month, personIds? }` (`personIds` = só essas pessoas, por exemplo reenviar para quem falhou) |
| `GET /summary/dispatches?month=` | histórico do mês (até 20, do mais recente) |
| `GET /summary/dispatches/email?month=&personId=` | o e-mail de uma pessoa (assunto, HTML, texto) sem enviar |

O `POST` responde **200 mesmo com falhas parciais**. Cada pessoa vira um item:

| `status` | Quando | `message` (pronta para a tela) |
| --- | --- | --- |
| `SENT` | aceito pelo servidor do Gmail | `null` |
| `SKIPPED_NO_EMAIL` | pessoa sem e-mail cadastrado | "Bruno não tem e-mail cadastrado." |
| `FAILED` | o envio para ela falhou (`errorCode`: `MAIL_RECIPIENT_REJECTED`, `MAIL_CONNECTION_FAILED` ou `MAIL_SEND_FAILED`) | "O servidor de e-mail recusou o endereço de Ana. Confira o e-mail cadastrado." |

As outras pessoas recebem normalmente. "Enviado" significa aceito pelo servidor, não lido: uma devolução
posterior (endereço que não existe) chega na caixa do remetente, não na API.

## Duplo clique e envios ao mesmo tempo

1. **Idempotency-Key** (UUID que o front gera a cada intenção de envio): a mesma chave devolve o resultado
   gravado, sem reenviar. Ainda rodando: `409 SUMMARY_DISPATCH_IN_PROGRESS`. Usada em outro mês:
   `409 SUMMARY_DISPATCH_KEY_REUSED`.
2. **Um envio por mês de cada vez:** `SummaryDispatch.runningMonth` é único e só fica preenchido enquanto o
   envio roda (o Postgres aceita vários `NULL` num índice único). Um segundo envio do mesmo mês recebe
   `409 SUMMARY_DISPATCH_IN_PROGRESS`. A trava fica no banco, não na memória, porque a Vercel pode rodar
   duas instâncias da função ao mesmo tempo.
3. **Envio preso:** se a função cair no meio, o envio fica em `RUNNING`. Passados 5 minutos
   (`STALE_DISPATCH_MS`), o próximo envio do mês o marca como `INTERRUPTED` e segue.

Antes de começar, a API confere a conexão SMTP (`verify`). Se falhar, ninguém receberia, então o envio
nem começa: `503 MAIL_UNAVAILABLE` (com `MAIL_ENABLED=0`: `503 MAIL_DISABLED`).

## Configurar o Gmail

1. Na Conta Google que vai enviar: **Segurança > Verificação em duas etapas** (obrigatória para a senha de
   app) e depois **Senhas de app**: crie uma para "Golduck".
2. No painel da Vercel do projeto (*Settings > Environment Variables*, ambiente *Production*):

| Variável | Valor |
| --- | --- |
| `MAIL_ENABLED` | `1` |
| `MAIL_SMTP_USER` | o endereço do Gmail |
| `MAIL_SMTP_PASS` | a senha de app (16 letras, sem espaços) |
| `MAIL_FROM` | opcional, como `Golduck <voce@gmail.com>` (padrão: `Golduck <MAIL_SMTP_USER>`) |
| `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` | opcionais (padrão `smtp.gmail.com` e `465`) |

3. Cadastre o e-mail de cada pessoa em Pessoas.
4. Confira o texto com `GET /summary/dispatches/email` antes do primeiro envio.

Sem essas variáveis (o padrão), o envio fica desligado e o botão recebe `503 MAIL_DISABLED`. O Gmail
aceita até 500 destinatários por dia, muito acima do uso daqui.

## Logs

- `info` "Resumo enviado por e-mail", com `month`, `dispatchId` e as contagens.
- `warn` "Falha ao enviar o resumo por e-mail", com o destinatário **mascarado**, o `code` e o motivo técnico.

O endereço completo e a senha nunca vão para o log.

## Testes

`spec/` do módulo: renderizador (função pura), mailer SMTP com transporte falso, service com
repositórios em memória e o `FakeSummaryMailer` (falhas por destinatário, `verify` com erro), rotas por
HTTP e repositório com Prisma falso. Nenhum teste envia e-mail de verdade.
