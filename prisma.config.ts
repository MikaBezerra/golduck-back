import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// As migrações usam a conexão direta (DATABASE_DIRECT_URL) quando ela existe: pelo pooler do Neon
// (PgBouncer em modo transação) a trava que o `prisma migrate` usa não funciona. Sem ela, vale a DATABASE_URL.
export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    datasource: { url: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL || '' }
});
