import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configurerApplication } from '../../src/configurer-application.js';
import type {
  RequeteAuthentifiee,
  UtilisateurConnecte,
} from '../../src/commun/autorisation/utilisateur-connecte.js';
import { Horloge } from '../../src/commun/horloge.js';
import { JournalDesActions } from '../../src/journal/journal-des-actions.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/*
 * Application de test des clients et des techniciens (#15), montée comme celle de
 * tournees.e2e-spec.ts : temps figé, journal simulé, et l'utilisateur placé dans request.user
 * par l'en-tête x-test-utilisateur, là où la stratégie JWT de la card #13 le mettra.
 */

const ENTETE_UTILISATEUR = 'x-test-utilisateur';

export interface ApplicationDeTest {
  app: INestApplication<App>;
  prisma: PrismaService;
}

type JetonDeFournisseur = Parameters<TestingModuleBuilder['overrideProvider']>[0];

export interface OptionsApplication {
  /** Seul journal.e2e-spec.ts écrit dans le MongoDB éphémère ; les autres simulent. */
  journalReel?: boolean;
  /** Fournisseurs remplacés par un double, par exemple un repository qui lève une erreur. */
  doubles?: ReadonlyArray<[jeton: JetonDeFournisseur, double: unknown]>;
}

export async function demarrerApplication(
  maintenant: Date,
  { journalReel = false, doubles = [] }: OptionsApplication = {},
): Promise<ApplicationDeTest> {
  const constructeur = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Horloge)
    .useValue({ maintenant: () => maintenant });
  if (!journalReel) {
    constructeur
      .overrideProvider(JournalDesActions)
      .useValue({ enregistrer: () => Promise.resolve() });
  }
  for (const [jeton, double] of doubles) {
    constructeur.overrideProvider(jeton).useValue(double);
  }
  const module = await constructeur.compile();
  const app = module.createNestApplication<NestExpressApplication>();
  app.use(authentificationDeTest);
  // Comme main.ts : préfixe api/v1 et limites du corps JSON (1,5 Mo pour l'import, 100 Ko ailleurs).
  configurerApplication(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await viderLaBase(prisma);
  return { app: app as INestApplication<App>, prisma };
}

/** Requêtes HTTP envoyées au nom d'un utilisateur, ou sans utilisateur (401). */
export function requetesEn(app: INestApplication<App>, utilisateur?: UtilisateurConnecte) {
  const agent = request(app.getHttpServer());
  const avecUtilisateur = <T extends request.Test>(requete: T): T =>
    utilisateur === undefined
      ? requete
      : requete.set(ENTETE_UTILISATEUR, `${utilisateur.role}:${utilisateur.id}`);
  return {
    get: (url: string) => avecUtilisateur(agent.get(`/api/v1${url}`)),
    post: (url: string) => avecUtilisateur(agent.post(`/api/v1${url}`)),
    patch: (url: string) => avecUtilisateur(agent.patch(`/api/v1${url}`)),
    put: (url: string) => avecUtilisateur(agent.put(`/api/v1${url}`)),
    delete: (url: string) => avecUtilisateur(agent.delete(`/api/v1${url}`)),
  };
}

export async function viderLaBase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      signature_intervention, intervention, tournee, indisponibilite, technicien,
      adresse, client, type_intervention, jeton_rafraichissement, jeton_reinitialisation,
      utilisateur
    RESTART IDENTITY`;
}

/** Comptes de test ; les mots de passe ne servent pas, l'authentification est simulée. */
export async function creerCompte(
  prisma: PrismaService,
  donnees: { email: string; nom: string; prenom: string; role: UtilisateurConnecte['role'] },
  actif = true,
): Promise<UtilisateurConnecte> {
  const compte = await prisma.utilisateur.create({
    data: { ...donnees, actif, motDePasseHash: 'inutilise-dans-ce-test' },
  });
  return { id: compte.id, role: compte.role };
}

function authentificationDeTest(
  requete: RequeteAuthentifiee,
  _reponse: Response,
  suivant: NextFunction,
): void {
  const valeur = requete.headers[ENTETE_UTILISATEUR];
  if (typeof valeur === 'string') {
    const [role, id] = valeur.split(':');
    requete.user = { role: role as UtilisateurConnecte['role'], id: Number(id) };
  }
  suivant();
}
