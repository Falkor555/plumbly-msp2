import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Même image et même fuseau que le service db de docker-compose.yml : les tests tournent
// sur le moteur de l'application, pas sur une approximation.
const IMAGE_POSTGRES = 'postgres:17-alpine';
const IMAGE_MONGODB = 'mongo:8';
const PORT_MONGODB = 27017;
const BASE_MONGODB = 'plumbly_test';
const FUSEAU_HORAIRE = 'Indian/Reunion';

declare module 'vitest' {
  export interface ProvidedContext {
    urlBaseDeTest: string;
    urlMongoDbDeTest: string;
  }
}

let conteneur: StartedPostgreSqlContainer | undefined;
let conteneurMongoDb: StartedMongoDBContainer | undefined;

export async function setup(projet: TestProject): Promise<void> {
  [conteneur, conteneurMongoDb] = await Promise.all([demarrerPostgres(), demarrerMongoDb()]);

  const url = conteneur.getConnectionUri();
  appliquerMigrations(url);
  projet.provide('urlBaseDeTest', url);
  projet.provide('urlMongoDbDeTest', urlMongoDb(conteneurMongoDb));
}

function demarrerPostgres(): Promise<StartedPostgreSqlContainer> {
  return (
    new PostgreSqlContainer(IMAGE_POSTGRES)
      .withDatabase('plumbly_test')
      .withUsername('plumbly_test')
      // Mot de passe tiré au hasard à chaque campagne : aucun secret n'est écrit dans le dépôt.
      .withPassword(randomBytes(16).toString('hex'))
      .withEnvironment({ TZ: FUSEAU_HORAIRE, PGTZ: FUSEAU_HORAIRE })
      .start()
  );
}

function demarrerMongoDb(): Promise<StartedMongoDBContainer> {
  return new MongoDBContainer(IMAGE_MONGODB).withEnvironment({ TZ: FUSEAU_HORAIRE }).start();
}

/**
 * Testcontainers lance MongoDB en replica set, annoncé sous le nom interne du conteneur :
 * directConnection=true fait parler le driver au port publié sans chercher ce nom, que le poste
 * ne sait pas résoudre. La base est nommée comme en développement (…/plumbly).
 */
function urlMongoDb(mongo: StartedMongoDBContainer): string {
  return `mongodb://${mongo.getHost()}:${mongo.getMappedPort(PORT_MONGODB)}/${BASE_MONGODB}?directConnection=true`;
}

/** Applique les migrations Prisma une fois pour toute la campagne : la base de test a le schéma de l'application. */
function appliquerMigrations(url: string): void {
  // CLI Prisma lancée avec le Node courant plutôt que par npx : même commande sous Windows et sous Linux.
  const cliPrisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [cliPrisma, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  await Promise.all([conteneur?.stop(), conteneurMongoDb?.stop()]);
}
