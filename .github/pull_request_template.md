## O que muda

<!-- Resumo em uma ou duas frases. O título do PR deve seguir o padrão: feat: ..., fix: ..., chore: ... -->

## Como testar

<!-- Passos ou requisições para conferir a mudança. -->

## Checklist

- [ ] `npm run lint:check`, `npm run typecheck`, `npm run test:cov` e `npm run build` passam localmente
- [ ] Mudou o `schema.prisma`? Criei a migração (`npx prisma migrate dev --name ...`)
- [ ] Mudou um contrato da API? Atualizei o Swagger (DTOs com `@ApiProperty`) e avisei o front
- [ ] Nova variável de ambiente? Atualizei `.env.example`, `.env.develop` e `.env.production`
