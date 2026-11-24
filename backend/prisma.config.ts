import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 ne lit plus .env tout seul. Hors Docker, backend/.env fournit DATABASE_URL ;
// dans Docker, la variable vient de docker-compose.yml et un fichier .env n'écrase pas une variable déjà définie.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.ts',
  },
  datasource: {
    // process.env plutôt que env() : `prisma generate` doit fonctionner sans base (build Docker, tests unitaires).
    // Les commandes qui touchent la base (migrate, seed) échouent avec un message explicite si l'URL manque.
    url: process.env.DATABASE_URL,
  },
});
