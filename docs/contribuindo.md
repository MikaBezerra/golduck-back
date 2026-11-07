# Contribuindo

## Regra de ouro: código, testes e documentação andam juntos

**Toda implementação (feature, correção ou refatoração) atualiza, no mesmo PR:**

1. **Os testes** do que mudou ([testes.md](testes.md)): a cobertura não pode cair (o `test:cov` barra
   abaixo das metas) e a mutação do módulo mexido não pode piorar.
2. **A documentação** em `docs/` que descreve o que mudou (o [guia geral](README.md) diz qual documento
   cobre cada assunto). Se nenhum documento cobre o assunto, crie um e acrescente no guia.

Um PR sem os dois não está pronto, por menor que seja a mudança. A exceção são mudanças que não alteram
comportamento nem documentação (ex.: atualizar uma dependência sem mudança de API); diga isso na
descrição do PR.

## Passo a passo

1. Crie a branch a partir da `develop`: `feat/nome-curto`, `fix/nome-curto`...
2. Implemente com os testes. Para um bug, comece por um teste que reproduz o problema.
3. Atualize `docs/` (e o `README.md` da raiz, se mudou algo do resumo ou do "como rodar").
4. Rode a mutação do módulo mexido e trate os sobreviventes do código novo:
   `STRYKER_MUTATE=src/modules/<módulo> npm run test:mutation`.
5. Rode `npm run verify` (o mesmo do CI).
6. Commit no padrão Conventional Commits, em português: `feat: ...`, `fix: ...`, `test: ...`,
   `docs: ...`, `refactor: ...`, `chore: ...`, `ci: ...`. O hook `commit-msg` (Husky + commitlint)
   barra mensagens fora do padrão, e o `pre-commit` barra `DATABASE_URL`, `DATABASE_DIRECT_URL` ou
   `JWT_SECRET` sem criptografia no `.env.develop`/`.env.production` (`scripts/check-env-encrypted.mjs`).
7. Abra o PR para a `develop` com o título no mesmo padrão (vira o commit do squash) e preencha o
   checklist do template.

## Definição de pronto

- [ ] Testes novos/alterados para o que mudou; `npm run verify` passa.
- [ ] Mutação do módulo mexido sem sobreviventes novos no código alterado (ou justificados no PR).
- [ ] `docs/` atualizado (e o guia, se criou um documento).
- [ ] Contrato da API mudou? Swagger (`@ApiProperty`) e [api.md](api.md) atualizados, front avisado.
- [ ] `schema.prisma` mudou? Migração criada e [banco-de-dados.md](banco-de-dados.md) atualizado.
- [ ] Variável de ambiente nova? `config.provider.ts`, `.env.example`, `.env.develop`, `.env.production`
  e [ambiente-e-configuracao.md](ambiente-e-configuracao.md).

## Estilo

- 4 espaços, aspas simples, modificador de acesso explícito (`public`/`private`) — o ESLint confere.
- Código em inglês; comentários, mensagens de erro, logs e documentação em português.
- Comentários explicam o porquê, não repetem o código.
