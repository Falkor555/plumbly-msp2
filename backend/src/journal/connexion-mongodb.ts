import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type Db, MongoClient } from 'mongodb';

/*
 * Délai pour trouver un serveur MongoDB. Le défaut du driver est de 30 s : MongoDB éteint, chaque
 * planification attendrait 30 s avant de répondre. 2 s suffisent pour une base locale ou Docker.
 */
const DELAI_SELECTION_SERVEUR_MS = 2_000;

/**
 * Client MongoDB unique de l'API (journal des actions, ADR 0006).
 *
 * Le driver ouvre la connexion à la première opération et se reconnecte seul : l'API démarre
 * même si MongoDB est éteint, contrairement à PostgreSQL qui porte les données métier.
 */
@Injectable()
export class ConnexionMongoDb implements OnModuleDestroy {
  private readonly client = new MongoClient(lireUrlMongoDb(), {
    serverSelectionTimeoutMS: DELAI_SELECTION_SERVEUR_MS,
  });

  /** Base nommée dans MONGODB_URI (…/plumbly). */
  base(): Db {
    return this.client.db();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}

/**
 * Une variable absente est une erreur de configuration, pas une panne : l'API refuse de démarrer
 * plutôt que de tourner sans journal sans que personne ne s'en aperçoive.
 */
export function lireUrlMongoDb(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.MONGODB_URI;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'MONGODB_URI manquante : la définir dans backend/.env (voir .env.example) ou via docker-compose.yml.',
    );
  }
  return url;
}
