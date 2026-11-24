import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.ts';
import { creerAdaptateurPostgres } from './adaptateur-postgres.js';

/** Accès PostgreSQL de l'API : client Prisma injectable dans les repositories. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: creerAdaptateurPostgres(lireUrlBase()) });
  }

  async onModuleInit(): Promise<void> {
    // Avec l'adaptateur pg, $connect() n'ouvre aucune connexion : sans cette requête, l'API
    // démarrerait sur une base injoignable et n'échouerait qu'à la première requête d'un utilisateur.
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (erreur) {
      throw new Error(
        'Connexion à PostgreSQL impossible au démarrage : vérifier DATABASE_URL et que la base tourne.',
        {
          cause: erreur,
        },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export function lireUrlBase(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'DATABASE_URL manquante : la définir dans backend/.env (voir .env.example) ou via docker-compose.yml.',
    );
  }
  return url;
}
