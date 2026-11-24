import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
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

export async function demarrerApplication(maintenant: Date): Promise<ApplicationDeTest> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Horloge)
    .useValue({ maintenant: () => maintenant })
    .overrideProvider(JournalDesActions)
    .useValue({ enregistrer: () => Promise.resolve() })
    .compile();
  const app = module.createNestApplication<INestApplication<App>>();
  app.use(authentificationDeTest);
  app.setGlobalPrefix('api/v1');
  await app.init();
  const prisma = app.get(PrismaService);
  await viderLaBase(prisma);
  return { app, prisma };
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
      intervention, tournee, indisponibilite, technicien, adresse, client,
      type_intervention, jeton_rafraichissement, jeton_reinitialisation, utilisateur
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
