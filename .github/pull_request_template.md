## O que muda

<!-- Resumo em uma ou duas frases. O título do PR deve seguir o padrão: feat: ..., fix: ..., chore: ... -->

## Como testar

<!-- Passos ou requisições para conferir a mudança. -->

## Checklist

<!-- Regra do projeto: código, testes e documentação andam juntos (docs/contribuindo.md). -->

- [ ] Testes novos/alterados para o que mudou e `npm run verify` passa localmente
- [ ] Mutação do módulo mexido sem sobreviventes novos no código alterado (`STRYKER_MUTATE=src/modules/<módulo> npm run test:mutation`), ou justificados abaixo
- [ ] Documentação em `docs/` atualizada (o `docs/README.md` diz qual arquivo cobre cada assunto)
- [ ] Mudou o `schema.prisma`? Criei a migração (`npx prisma migrate dev --name ...`)
- [ ] Mudou um contrato da API? Atualizei o Swagger (DTOs com `@ApiProperty`), o `docs/api.md` e avisei o front
- [ ] Nova variável de ambiente? Atualizei `.env.example`, `.env.develop`, `.env.production` e `docs/ambiente-e-configuracao.md`
