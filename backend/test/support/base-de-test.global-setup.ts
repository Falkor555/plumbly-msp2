import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Même image et même fuseau que le service db de docker-compose.yml : les tests tournent
// sur le moteur de l'application, pas sur une approximation.
const IMAGE_POSTGRES = 'postgres:17-alpine';
const FUSEAU_HORAIRE = 'Indian/Reunion';

declare module 'vitest' {
  export interface ProvidedContext {
    urlBaseDeTest: string;
  }
}

let conteneur: StartedPostgreSqlContainer | undefined;

export async function setup(projet: TestProject): Promise<void> {
  conteneur = await new PostgreSqlContainer(IMAGE_POSTGRES)
    .withDatabase('plumbly_test')
    .withUsername('plumbly_test')
    // Mot de passe tiré au hasard à chaque campagne : aucun secret n'est écrit dans le dépôt.
    .withPassword(randomBytes(16).toString('hex'))
    .withEnvironment({ TZ: FUSEAU_HORAIRE, PGTZ: FUSEAU_HORAIRE })
    .start();

  const url = conteneur.getConnectionUri();
  appliquerMigrations(url);
  projet.provide('urlBaseDeTest', url);
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
  await conteneur?.stop();
}
