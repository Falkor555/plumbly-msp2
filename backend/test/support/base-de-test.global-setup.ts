import { randomBytes } from 'node:crypto';
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

  // Les migrations Prisma (card #8) s'appliqueront ici, une fois pour toute la campagne.
  projet.provide('urlBaseDeTest', conteneur.getConnectionUri());
}

export async function teardown(): Promise<void> {
  await conteneur?.stop();
}
