import { RequestMethod, type Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { AppController } from '../src/app.controller.js';
import { CLE_ROLES } from '../src/commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../src/commun/autorisation/roles.guard.js';
import type { Role } from '../src/generated/prisma/client.ts';
import { demarrerApplication, requetesEn, viderLaBase } from './support/application-de-test.js';

/*
 * Preuves des mesures de sécurité de l'API (issue #46), présentées à la soutenance. Chaque test
 * porte l'identifiant de la mesure qu'il démontre (TS-xx).
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

/** Route telle que NestJS l'a enregistrée, sans le préfixe /api/v1. */
interface RouteExposee {
  methode: string;
  chemin: string;
  controleur: Type;
  nomMethode: string;
  gestionnaire: Gestionnaire;
}

/** Méthode de contrôleur : NestJS pose ses métadonnées sur la fonction elle-même. */
type Gestionnaire = (...parametres: never[]) => unknown;

type Verbe = 'get' | 'post' | 'patch' | 'put' | 'delete';

const reflecteur = new Reflector();

/**
 * Seule route volontairement publique. Toute autre exception doit être ajoutée ici, avec sa
 * raison, pour que la relecture la voie.
 */
const CONTROLEURS_PUBLICS: ReadonlyMap<Type, string> = new Map<Type, string>([
  [
    AppController,
    'GET /api/v1 renvoie un message de bienvenue qui prouve que l’API répond ; ' +
      'elle ne lit ni n’écrit aucune donnée.',
  ],
]);

/** Routes de tous les contrôleurs chargés par NestJS : un contrôleur ajouté demain y figure. */
function routesDeLApplication(conteneur: ModulesContainer): RouteExposee[] {
  return [...conteneur.values()]
    .flatMap((module) => [...module.controllers.values()])
    .flatMap(({ metatype }) => routesDuControleur(metatype as Type));
}

function routesDuControleur(controleur: Type): RouteExposee[] {
  const prototype = controleur.prototype as Record<string, Gestionnaire>;
  // Même parcours que celui du routeur de NestJS : les méthodes héritées comptent aussi.
  return new MetadataScanner().getAllMethodNames(prototype).flatMap((nomMethode) => {
    const gestionnaire = prototype[nomMethode];
    const methode = reflecteur.get(METHOD_METADATA, gestionnaire) as RequestMethod | undefined;
    if (methode === undefined) {
      return [];
    }
    return cheminsDe(controleur, gestionnaire).map((chemin) => ({
      methode: RequestMethod[methode],
      chemin,
      controleur,
      nomMethode,
      gestionnaire,
    }));
  });
}

function cheminsDe(controleur: Type, gestionnaire: Gestionnaire): string[] {
  const prefixes = [reflecteur.get(PATH_METADATA, controleur) as string | string[]].flat();
  const suffixes = [reflecteur.get(PATH_METADATA, gestionnaire) as string | string[]].flat();
  return prefixes.flatMap((prefixe) =>
    suffixes.map((suffixe) => {
      const morceaux = [prefixe, suffixe].flatMap((morceau) => morceau.split('/'));
      return `/${morceaux.filter((morceau) => morceau !== '').join('/')}`;
    }),
  );
}

function decrire(route: RouteExposee): string {
  return `${route.methode} ${route.chemin} (${route.controleur.name}.${route.nomMethode})`;
}

/** Ce qui manque à la route pour être fermée par défaut ; vide si elle est protégée. */
function defautsDeProtection(route: RouteExposee): string[] {
  const gardes = [route.controleur, route.gestionnaire].flatMap(
    (cible) => (reflecteur.get(GUARDS_METADATA, cible) as unknown[] | undefined) ?? [],
  );
  // Même lecture que RolesGuard : le @Roles de la méthode remplace celui du contrôleur.
  const roles = reflecteur.getAllAndOverride(CLE_ROLES, [route.gestionnaire, route.controleur]) as
    Role[] | undefined;
  const defauts: string[] = [];
  if (!gardes.includes(RolesGuard)) {
    defauts.push('RolesGuard absent');
  }
  if (roles === undefined || roles.length === 0) {
    defauts.push('aucun rôle déclaré par @Roles');
  }
  return defauts;
}

function verbeDe(route: RouteExposee): Verbe {
  const verbe = route.methode.toLowerCase();
  if (!['get', 'post', 'patch', 'put', 'delete'].includes(verbe)) {
    throw new Error(`Méthode HTTP non prévue par ce test : ${decrire(route)}`);
  }
  return verbe as Verbe;
}

// L'application est démarrée avant la collecte des tests : it.each a besoin de la liste des
// routes au moment où il déclare ses cas, avant tout beforeAll.
const application = await demarrerApplication(MAINTENANT);
const ROUTES = routesDeLApplication(application.app.get(ModulesContainer));
const ROUTES_PUBLIQUES = ROUTES.filter((route) => CONTROLEURS_PUBLICS.has(route.controleur));
const ROUTES_PROTEGEES = ROUTES.filter((route) => !CONTROLEURS_PUBLICS.has(route.controleur));

afterAll(async () => {
  await viderLaBase(application.prisma);
  await application.app.close();
});

describe('TS-01 : aucune route n’est ouverte par défaut', () => {
  it('TS-01 : le parcours trouve plus de 30 routes, dont une seule publique : GET /', () => {
    expect(ROUTES.length).toBeGreaterThan(30);
    expect(ROUTES_PUBLIQUES.map(decrire)).toEqual(['GET / (AppController.getHello)']);
  });

  it('TS-01 : chaque route protégée pose RolesGuard et déclare ses rôles avec @Roles', () => {
    const fautives = ROUTES_PROTEGEES.map((route) => ({
      route: decrire(route),
      defauts: defautsDeProtection(route),
    })).filter(({ defauts }) => defauts.length > 0);

    expect(fautives).toEqual([]);
  });

  it.each(ROUTES_PROTEGEES)(
    'TS-01 : $methode $chemin répond 401 sans utilisateur',
    async (route) => {
      const url = route.chemin.replace(/:\w+/g, '1');

      const reponse = await requetesEn(application.app)[verbeDe(route)](url).send({});

      expect(reponse.status).toBe(401);
      expect(reponse.body).toEqual({
        statusCode: 401,
        message: 'Authentification requise.',
        error: 'Unauthorized',
      });
    },
  );
});
